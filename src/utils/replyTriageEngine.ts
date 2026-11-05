import { BrokerReplyCategory, DataBroker, UserProfile } from '../types';
import { resolveBrokerContactProfile } from './brokerContactResolver';

const TRACKING_QUERY_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_name',
  'utm_reader',
  'utm_Brand',
  'fbclid',
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'twclid',
  'yclid',
  'mc_cid',
  'mc_eid',
  'mkt_tok',
  '_hsenc',
  '_hsmi',
  'hsCtaTracking',
  'vero_id',
  'vero_conv',
  'igshid',
  'si',
  'spm',
  'sc_cid',
  'trk',
  'ref_src',
  'oly_enc_id',
  'oly_anon_id',
  'rb_clickid',
]);

export interface SanitizedUrlResult {
  originalUrl: string;
  sanitizedUrl: string;
  strippedParams: string[];
  host: string;
  isHttps: boolean;
  matchesBrokerDomain: boolean | null;
}

export function sanitizeTrackingUrl(
  rawUrl: string,
  expectedBrokerDomain?: string
): SanitizedUrlResult {
  const trimmed = rawUrl.trim().replace(/[)>.,;'"\]}]+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      originalUrl: trimmed,
      sanitizedUrl: trimmed,
      strippedParams: [],
      host: '',
      isHttps: trimmed.startsWith('https://'),
      matchesBrokerDomain: expectedBrokerDomain ? false : null,
    };
  }

  const strippedParams: string[] = [];
  const keys = Array.from(parsed.searchParams.keys());
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (
      TRACKING_QUERY_PARAMS.has(lower) ||
      lower.startsWith('utm_') ||
      lower.startsWith('hsa_') ||
      lower.startsWith('pk_')
    ) {
      strippedParams.push(key);
      parsed.searchParams.delete(key);
    }
  }

  const host = parsed.hostname.toLowerCase();
  let matchesBrokerDomain: boolean | null = null;
  if (expectedBrokerDomain) {
    const cleanExpected = expectedBrokerDomain.toLowerCase().replace(/^www\./, '');
    matchesBrokerDomain =
      host === cleanExpected || host.endsWith(`.${cleanExpected}`);
  }

  return {
    originalUrl: trimmed,
    sanitizedUrl: parsed.toString(),
    strippedParams,
    host,
    isHttps: parsed.protocol === 'https:',
    matchesBrokerDomain,
  };
}

export interface BrokerReplyAnalysis {
  category: BrokerReplyCategory;
  categoryLabel: string;
  summary: string;
  extractedTicketIds: string[];
  extractedLinks: SanitizedUrlResult[];
  excessiveIdTriggers: string[];
  exemptionTriggers: string[];
  bouncedAddresses: string[];
  recommendedFallbackEmail?: string;
  recommendedAction: string;
  hasDomainMismatchWarning: boolean;
}

export function analyzeBrokerReplyEmail(
  rawEmailText: string,
  expectedBroker?: DataBroker
): BrokerReplyAnalysis {
  const text = rawEmailText || '';
  const lower = text.toLowerCase();

  // Extract HTTP/HTTPS URLs
  const urlMatches = text.match(/https?:\/\/[^\s<>"'`]+/gi) || [];
  const uniqueUrls = Array.from(new Set(urlMatches.map((u) => u.replace(/[)>.,;'"\]}]+$/, ''))));
  const extractedLinks = uniqueUrls.map((u) =>
    sanitizeTrackingUrl(u, expectedBroker?.domain)
  );

  // Extract Ticket / Case / Reference numbers
  const ticketRegexes = [
    /(?:case|ticket|request|reference|ref|confirmation|incident|inquiry)\s*(?:id|number|no\.?|code|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{4,28})/gi,
    /#([0-9]{5,14})\b/g,
  ];
  const ticketSet = new Set<string>();
  for (const rx of ticketRegexes) {
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) {
      const candidate = m[1].trim();
      if (/\d/.test(candidate) && candidate.length >= 5) {
        ticketSet.add(candidate);
      }
    }
  }
  const extractedTicketIds = Array.from(ticketSet).slice(0, 6);

  // Detect excessive government ID / sensitive PII demands
  const idPatterns: { label: string; rx: RegExp }[] = [
    { label: "Driver's License", rx: /driver['’]?s?\s+licen[sc]e/i },
    { label: 'Government-Issued Photo ID', rx: /government[- ]issued\s+(?:photo\s+)?id|copy\s+of\s+your\s+(?:photo\s+)?id|state\s+id\s+card/i },
    { label: 'Social Security Number (SSN)', rx: /social\s+security\s+number|\bssn\b/i },
    { label: 'Passport Copy', rx: /\bpassport\b/i },
    { label: 'Utility Bill / Bank Statement', rx: /utility\s+bill|bank\s+statement/i },
    { label: 'Notarized Affidavit', rx: /notariz(?:ed|ation)/i },
  ];
  const excessiveIdTriggers = idPatterns
    .filter((p) => p.rx.test(text))
    .map((p) => p.label);

  // Detect statutory exemption / refusal boilerplate
  const exemptionPatterns: { label: string; rx: RegExp }[] = [
    { label: 'Publicly Available Government Records Claim', rx: /publicly\s+available\s+(?:information|records?)|government\s+records?\s+exemption/i },
    { label: 'GLBA Financial Privacy Exemption Claim', rx: /gramm[- ]leach[- ]bliley|\bglba\b/i },
    { label: 'FCRA Consumer Reporting Claim', rx: /fair\s+credit\s+reporting\s+act|\bfcra\b/i },
    { label: 'First Amendment / Directory Refusal', rx: /first\s+amendment|unable\s+to\s+(?:honor|fulfill|comply|delete)|deny\s+your\s+(?:request|deletion)/i },
  ];
  const exemptionTriggers = exemptionPatterns
    .filter((p) => p.rx.test(text))
    .map((p) => p.label);

  // Detect completion / confirmation phrasing
  const isDeletionConfirmed =
    /(?:has\s+been|have\s+been)\s+(?:removed|deleted|suppressed|opted\s+out|purged|expunged)|completed\s+your\s+(?:deletion|opt[- ]out|removal)\s+request|record\s+is\s+now\s+suppressed|successfully\s+(?:removed|deleted|opted\s+out)/i.test(
      lower
    ) && !/click\s+(?:the\s+)?(?:link|button|below)\s+to\s+confirm/i.test(lower);

  const requiresLinkClick =
    extractedLinks.length > 0 &&
    /confirm\s+your\s+(?:email|request|opt[- ]out|deletion|identity)|verify\s+your\s+(?:email|request|opt[- ]out)|click\s+(?:the\s+)?(?:link|below|here)\s+to\s+(?:complete|confirm|verify|finalize)/i.test(
      lower
    );

  const hasDomainMismatchWarning =
    Boolean(expectedBroker) &&
    extractedLinks.some((l) => l.matchesBrokerDomain === false);

  // Detect Mailer-Daemon / DSN 550 / NXDOMAIN / Undeliverable bounce-backs
  const isDeliveryBounce =
    /mailer-daemon|postmaster@|delivery\s+status\s+notification\s*\(failure\)|address\s+not\s+found|message\s+not\s+delivered|wasn['’]?t\s+delivered\s+to|undeliverable:|550[- ]5\.1\.1|550[- ]5\.1\.10|554[- ]5\.7\.1|550\s+(?:no\s+such\s+user|user\s+unknown|mailbox\s+unavailable|requested\s+action\s+not\s+taken)|domain\s+not\s+found|host\s+or\s+domain\s+name\s+not\s+found|\bnxdomain\b/i.test(
      text
    );

  const bouncedSet = new Set<string>();
  if (isDeliveryBounce) {
    const bounceEmailPatterns = [
      /(?:final-recipient|original-recipient)\s*:\s*rfc822\s*;\s*([^\s<>;"',]+@[^\s<>;"',]+)/gi,
      /(?:wasn['’]?t\s+delivered\s+to|delivery\s+to\s+the\s+following\s+recipient\s+failed[:\s]*|could\s+not\s+be\s+delivered\s+to)\s*<?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})>?/gi,
      /<([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})>\s*:\s*(?:host|550|554|user|recipient|address)/gi,
    ];
    for (const rx of bounceEmailPatterns) {
      let m: RegExpExecArray | null;
      while ((m = rx.exec(text)) !== null) {
        const addr = m[1].trim().toLowerCase();
        if (!addr.startsWith('mailer-daemon@') && !addr.startsWith('postmaster@')) {
          bouncedSet.add(addr);
        }
      }
    }

    // Fallback: extract any address matching expected broker domain or common compliance prefixes
    if (bouncedSet.size === 0) {
      const genericEmails = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
      for (const rawAddr of genericEmails) {
        const lowerAddr = rawAddr.toLowerCase();
        if (lowerAddr.startsWith('mailer-daemon@') || lowerAddr.startsWith('postmaster@')) continue;
        if (
          (expectedBroker && lowerAddr.endsWith(expectedBroker.domain.toLowerCase())) ||
          /^(?:privacy|optout|support|removal|legal|compliance|help|consumer)/i.test(lowerAddr)
        ) {
          bouncedSet.add(lowerAddr);
        }
      }
    }
  }
  const bouncedAddresses = Array.from(bouncedSet);

  let recommendedFallbackEmail: string | undefined;
  if (expectedBroker) {
    const contactProfile = resolveBrokerContactProfile(expectedBroker);
    const nonBouncedCandidate = contactProfile.allValidCandidates.find(
      (c) => !bouncedSet.has(c.toLowerCase())
    );
    if (nonBouncedCandidate) {
      recommendedFallbackEmail = nonBouncedCandidate;
    }
  }

  let category: BrokerReplyCategory = 'GENERAL_ACKNOWLEDGMENT';
  let categoryLabel = 'General Intake Acknowledgment';
  let summary =
    'Broker acknowledged receipt of your statutory request. Keep the 45-day SLA countdown active until final deletion is verified.';
  let recommendedAction =
    'Save any extracted ticket ID to your SLA Tracker and verify removal within 45 calendar days.';

  if (isDeliveryBounce) {
    category = 'DELIVERY_BOUNCE_NDR';
    categoryLabel = 'Outbound Email Bounced (Undeliverable Compliance Address)';
    const bouncedDisplay =
      bouncedAddresses.length > 0 ? bouncedAddresses.join(', ') : 'the broker recipient mailbox';
    summary = `Your statutory opt-out email to ${bouncedDisplay} bounced back undelivered. Many data brokers retire generic mailboxes, route privacy compliance through a parent holding company DPO, or enforce CAPTCHA web-portal submissions.`;
    recommendedAction = recommendedFallbackEmail
      ? `Click "Blacklist Bounced Address & Route to ${recommendedFallbackEmail}" below to immediately re-dispatch your statutory deletion demand to the verified backup compliance desk, or complete the broker's direct opt-out web portal.`
      : `Blacklist the bounced address, enter an updated DPO contact, or launch the broker's official web opt-out portal directly below.`;
  } else if (excessiveIdTriggers.length > 0) {
    category = 'EXCESSIVE_ID_DEMAND';
    categoryLabel = 'Excessive Identity Verification Demand Flagged';
    summary = `Broker is demanding sensitive documentation (${excessiveIdTriggers.join(', ')}). Under Cal. Code Regs. tit. 11 § 7060(c)-(d), data brokers may not demand government photo ID or SSN when directory anchors (name, address, phone, email) already identify the record.`;
    recommendedAction =
      'Send the Statutory Data-Minimization Counter-Notice below via connected email, or use the local ID Redactor & Watermarker if dealing with a regulated FCRA bureau.';
  } else if (exemptionTriggers.length > 0) {
    category = 'EXEMPTION_CLAIM_OR_REFUSAL';
    categoryLabel = 'Boilerplate Exemption / Refusal Claim Detected';
    summary = `Broker cited ${exemptionTriggers.join(', ')} to resist deletion. Modern state privacy statutes (CA Delete Act SB 362, Texas TDPSA § 541.051, Oregon OCPA, Colorado CPA) explicitly apply to data obtained "from or about" the consumer and close commercial public-record loopholes.`;
    recommendedAction =
      'Dispatch the Statutory Omnibus Exemption Rebuttal below and escalate to the CPPA / State Attorney General if non-compliance persists.';
  } else if (isDeletionConfirmed) {
    category = 'DELETION_CONFIRMED';
    categoryLabel = 'Deletion / Suppression Confirmed by Broker';
    summary =
      'Broker states your personal information has been deleted or added to their permanent suppression list.';
    recommendedAction =
      'Record the confirmation ticket receipt, verify live on the broker domain, and mark this broker as Verified Scrubbed.';
  } else if (requiresLinkClick) {
    category = 'CONFIRMATION_LINK_REQUIRED';
    categoryLabel = 'One-Time Verification Link Action Required';
    summary =
      'Broker requires clicking a verification URL to finalize your opt-out request. Tracking parameters have been stripped below.';
    recommendedAction =
      'Verify the destination domain matches the broker before opening the sanitized confirmation URL.';
  }

  return {
    category,
    categoryLabel,
    summary,
    extractedTicketIds,
    extractedLinks,
    excessiveIdTriggers,
    exemptionTriggers,
    bouncedAddresses,
    recommendedFallbackEmail,
    recommendedAction,
    hasDomainMismatchWarning,
  };
}

export function buildIdMinimizationCounterNotice(
  broker: DataBroker,
  profile: UserProfile,
  senderEmail?: string,
  ticketId?: string
): { subject: string; body: string } {
  const email = senderEmail || profile.emails[0] || 'consumer@example.com';
  const refSuffix = ticketId ? ` [Ref: ${ticketId}]` : '';
  const subject = `STATUTORY OBJECTION: Unlawful Government ID Verification Demand (11 CCR § 7060)${refSuffix} - ${profile.firstName} ${profile.lastName}`;
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const targetEmail =
    resolveBrokerContactProfile(broker).effectivePrimaryEmail ||
    broker.privacyEmail ||
    `privacy@${broker.domain}`;
  const body = `DATE: ${dateStr}
TO: Privacy Officer & Legal Compliance, ${broker.name} (${targetEmail})
FROM: ${profile.firstName} ${profile.lastName} <${email}>
RE: FORMAL OBJECTION TO EXCESSIVE IDENTITY VERIFICATION DEMAND${refSuffix}

To Whom It May Concern,

I am writing in response to ${broker.name}'s request for sensitive government-issued identification or additional personal documentation as a precondition to honoring my statutory deletion and opt-out demand.

STATUTORY VIOLATION OF DATA MINIMIZATION RULES:
1. Pursuant to California Consumer Privacy Act Regulations, Cal. Code Regs. tit. 11, § 7060(c)–(d), a business SHALL NOT require a consumer to provide additional personal information for verification beyond what is strictly necessary, and is expressly instructed to match identifying data points already maintained by the business.
2. Under Cal. Civ. Code § 1798.135 and 11 CCR § 7060(b), requests to Opt Out of Sale/Sharing (Cal. Civ. Code § 1798.120) are NOT subject to burdensome identity verification—requiring government ID to opt out of data sale is unlawful per se.
3. Under Texas TDPSA (Tex. Bus. & Com. Code § 541.053) and Virginia/Colorado/Connecticut omnibus privacy laws, controllers may not use verification procedures to deter, delay, or collect new high-risk PII (such as Driver's License numbers, photographs, or SSNs) that ${broker.name} does not already publish.

EXISTING MATCHING IDENTIFIERS ALREADY PROVIDED:
- Full Legal Name: ${profile.firstName} ${profile.lastName}
- Current Jurisdiction: ${profile.currentCity}, ${profile.currentState} ${profile.currentZip || ''}
- Associated Phone: ${profile.phoneNumbers[0] || 'On file'}
- Associated Email: ${email}
${ticketId ? `- Broker Case / Ticket Reference: ${ticketId}\n` : ''}
DEMAND FOR IMMEDIATE COMPLIANCE:
Please immediately process my statutory Opt-Out of Sale/Sharing and Deletion request using the matching directory attributes above without demanding unredacted government ID. Note that the original 45-calendar-day statutory SLA clock remains running from my initial verified submission. Continued refusal will be documented in a formal enforcement complaint to the California Privacy Protection Agency (CPPA) and State Attorney General.

Sincerely,
${profile.firstName} ${profile.lastName}
Data Subject`;

  return { subject, body };
}

export function buildExemptionRebuttalNotice(
  broker: DataBroker,
  profile: UserProfile,
  senderEmail?: string,
  ticketId?: string
): { subject: string; body: string } {
  const email = senderEmail || profile.emails[0] || 'consumer@example.com';
  const refSuffix = ticketId ? ` [Ref: ${ticketId}]` : '';
  const subject = `STATUTORY REBUTTAL: Rejection of Public-Records Exemption Claim${refSuffix} - ${profile.firstName} ${profile.lastName}`;
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const targetEmail =
    resolveBrokerContactProfile(broker).effectivePrimaryEmail ||
    broker.privacyEmail ||
    `privacy@${broker.domain}`;
  const body = `DATE: ${dateStr}
TO: Legal & Privacy Compliance Office, ${broker.name} (${targetEmail})
FROM: ${profile.firstName} ${profile.lastName} <${email}>
RE: STATUTORY REBUTTAL TO EXEMPTION CLAIM & FINAL DEMAND FOR SUPPRESSION${refSuffix}

To Whom It May Concern,

I am in receipt of ${broker.name}'s response asserting an exemption (such as "publicly available government information" or non-FCRA directory compilation) in response to my deletion and opt-out demand.

LEGAL REBUTTAL:
1. California Delete Act (SB 362, Cal. Civ. Code § 1798.99.80 et seq.) & CPRA: Registered data brokers collecting and monetizing personal dossiers from third-party and public sources are strictly required to honor consumer deletion and opt-out-of-sale/sharing mandates, and must permanently suppress the consumer from future re-ingestion.
2. State Omnibus Statutes Cover Data Obtained "From or About" the Consumer: Under Texas TDPSA (Tex. Bus. & Com. Code § 541.101(b)(4)), Oregon OCPA, New Jersey NJDPA, Colorado CPA, and Delaware DPDPA, the right to delete applies to personal data obtained FROM OR ABOUT the consumer, and commercial aggregation of residential addresses, phone numbers, relatives, and inferred profiles into monetized people-search dossiers exceeds lawful government-record fidelity exemptions.
3. Unconditional Right to Opt Out of Sale & Targeted Profiling: Even where narrow archival retention exceptions exist, NO exemption permits ${broker.name} to continue selling, licensing, or publicly displaying my compiled personal profile after an explicit Opt-Out of Sale/Sharing.

SUBJECT IDENTIFIERS FOR IMMEDIATE SUPPRESSION:
- Name: ${profile.firstName} ${profile.lastName}
- Residence: ${profile.currentCity}, ${profile.currentState}
- Contact Email: ${email}
${ticketId ? `- Reference Ticket: ${ticketId}\n` : ''}
Please confirm full public suppression and opt-out of sale within ten (10) business days, or prior to the expiration of the 45-day statutory deadline, whichever is earlier, to avoid regulatory referral.

Sincerely,
${profile.firstName} ${profile.lastName}`;

  return { subject, body };
}

export interface ImageMetadataStripReport {
  format: 'JPEG' | 'PNG' | 'UNSUPPORTED';
  originalByteLength: number;
  cleanedByteLength: number;
  bytesRemoved: number;
  strippedSegments: string[];
  hadExif: boolean;
  hadGps: boolean;
  hadXmp: boolean;
  cleanedBytes: Uint8Array;
}

function asciiSliceContains(bytes: Uint8Array, start: number, end: number, needle: string): boolean {
  const max = Math.min(bytes.length, end);
  const nLen = needle.length;
  if (max - start < nLen) return false;
  for (let i = start; i <= max - nLen; i++) {
    let matched = true;
    for (let j = 0; j < nLen; j++) {
      if (bytes[i + j] !== needle.charCodeAt(j)) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

/**
 * Pure binary JPEG & PNG metadata (EXIF / GPS / XMP / IPTC / tEXt / eXIf) inspector and stripper.
 * Operates 100% in memory on raw Uint8Array bytes without uploading any files externally.
 */
export function inspectAndStripImageMetadataBytes(
  bytes: Uint8Array
): ImageMetadataStripReport {
  // Check JPEG SOI marker (0xFF 0xD8)
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const chunks: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
    const strippedSegments: string[] = [];
    let hadExif = false;
    let hadGps = false;
    let hadXmp = false;
    let offset = 2;

    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) {
        // Remaining entropy-coded scan data
        chunks.push(bytes.subarray(offset));
        break;
      }

      // Skip padding 0xFF bytes
      let markerPos = offset + 1;
      while (markerPos < bytes.length && bytes[markerPos] === 0xff) {
        markerPos++;
      }
      if (markerPos >= bytes.length) break;

      const marker = bytes[markerPos];

      // Standalone markers without length (TEM=0x01, RST0..RST7=0xD0..0xD7, EOI=0xD9)
      if (marker === 0xd9) {
        chunks.push(new Uint8Array([0xff, 0xd9]));
        break;
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        chunks.push(bytes.subarray(offset, markerPos + 1));
        offset = markerPos + 1;
        continue;
      }

      if (markerPos + 2 >= bytes.length) {
        chunks.push(bytes.subarray(offset));
        break;
      }

      const segLength = (bytes[markerPos + 1] << 8) | bytes[markerPos + 2];
      const segEnd = markerPos + 1 + segLength;
      if (segLength < 2 || segEnd > bytes.length) {
        chunks.push(bytes.subarray(offset));
        break;
      }

      // Start of Scan (0xDA): keep header + remainder of image stream through EOI
      if (marker === 0xda) {
        chunks.push(bytes.subarray(offset));
        break;
      }

      // Strip APP1..APP15 (0xE1..0xEF) and COM (0xFE) metadata segments; preserve APP0 (0xE0 JFIF)
      const isMetadataApp = marker >= 0xe1 && marker <= 0xef;
      const isComment = marker === 0xfe;

      if (isMetadataApp || isComment) {
        const payloadStart = markerPos + 3;
        if (marker === 0xe1) {
          if (asciiSliceContains(bytes, payloadStart, segEnd, 'Exif')) {
            hadExif = true;
            // Detect GPS IFD signature or ASCII GPS tag markers inside APP1
            if (
              asciiSliceContains(bytes, payloadStart, segEnd, 'GPS') ||
              containsGpsTagPointer(bytes, payloadStart, segEnd)
            ) {
              hadGps = true;
            }
            strippedSegments.push(`APP1 (EXIF${hadGps ? ' + GPS' : ''} · ${segLength}B)`);
          } else if (asciiSliceContains(bytes, payloadStart, segEnd, 'http://ns.adobe.com/xap')) {
            hadXmp = true;
            strippedSegments.push(`APP1 (Adobe XMP · ${segLength}B)`);
          } else {
            strippedSegments.push(`APP1 (Metadata · ${segLength}B)`);
          }
        } else if (isComment) {
          strippedSegments.push(`COM (JPEG Comment · ${segLength}B)`);
        } else {
          strippedSegments.push(`APP${marker - 0xe0} (Profile/IPTC · ${segLength}B)`);
        }
      } else {
        chunks.push(bytes.subarray(offset, segEnd));
      }

      offset = segEnd;
    }

    const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
    const cleanedBytes = new Uint8Array(totalLen);
    let writePos = 0;
    for (const c of chunks) {
      cleanedBytes.set(c, writePos);
      writePos += c.length;
    }

    return {
      format: 'JPEG',
      originalByteLength: bytes.length,
      cleanedByteLength: cleanedBytes.length,
      bytesRemoved: Math.max(0, bytes.length - cleanedBytes.length),
      strippedSegments,
      hadExif,
      hadGps,
      hadXmp,
      cleanedBytes,
    };
  }

  // Check PNG signature (89 50 4E 47 0D 0A 1A 0A)
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const chunks: Uint8Array[] = [bytes.subarray(0, 8)];
    const strippedSegments: string[] = [];
    let hadExif = false;
    let hadXmp = false;
    let offset = 8;

    const stripPngTypes = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

    while (offset + 12 <= bytes.length) {
      const dataLen =
        ((bytes[offset] << 24) >>> 0) +
        (bytes[offset + 1] << 16) +
        (bytes[offset + 2] << 8) +
        bytes[offset + 3];
      const chunkType = String.fromCharCode(
        bytes[offset + 4],
        bytes[offset + 5],
        bytes[offset + 6],
        bytes[offset + 7]
      );
      const chunkEnd = offset + 12 + dataLen;
      if (chunkEnd > bytes.length) {
        chunks.push(bytes.subarray(offset));
        break;
      }

      if (stripPngTypes.has(chunkType)) {
        if (chunkType === 'eXIf') hadExif = true;
        if (
          chunkType === 'iTXt' &&
          asciiSliceContains(bytes, offset + 8, chunkEnd, 'XML:com.adobe.xmp')
        ) {
          hadXmp = true;
        }
        strippedSegments.push(`PNG ${chunkType} (${dataLen + 12}B)`);
      } else {
        chunks.push(bytes.subarray(offset, chunkEnd));
      }

      offset = chunkEnd;
      if (chunkType === 'IEND') break;
    }

    const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
    const cleanedBytes = new Uint8Array(totalLen);
    let writePos = 0;
    for (const c of chunks) {
      cleanedBytes.set(c, writePos);
      writePos += c.length;
    }

    return {
      format: 'PNG',
      originalByteLength: bytes.length,
      cleanedByteLength: cleanedBytes.length,
      bytesRemoved: Math.max(0, bytes.length - cleanedBytes.length),
      strippedSegments,
      hadExif,
      hadGps: false,
      hadXmp,
      cleanedBytes,
    };
  }

  return {
    format: 'UNSUPPORTED',
    originalByteLength: bytes.length,
    cleanedByteLength: bytes.length,
    bytesRemoved: 0,
    strippedSegments: [],
    hadExif: false,
    hadGps: false,
    hadXmp: false,
    cleanedBytes: bytes,
  };
}

/**
 * Checks TIFF header inside APP1 Exif payload for GPS Info IFD pointer tag (0x8825).
 */
function containsGpsTagPointer(bytes: Uint8Array, start: number, end: number): boolean {
  for (let i = start; i + 1 < end; i++) {
    // Big-endian 0x88 0x25 or little-endian 0x25 0x88
    if (
      (bytes[i] === 0x88 && bytes[i + 1] === 0x25) ||
      (bytes[i] === 0x25 && bytes[i + 1] === 0x88)
    ) {
      return true;
    }
  }
  return false;
}
