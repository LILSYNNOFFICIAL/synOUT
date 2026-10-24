import { DataBroker, DeindexItem, ScanResult, UserProfile } from '../types';
import { getExhaustiveBrokerRegistry } from './dynamicBrokerRegistry';
import {
  BrokerContactOverride,
  isValidEmailSyntax,
  resolveBrokerContactProfile,
} from './brokerContactResolver';
import {
  buildStatutoryNoticeForBroker,
  findBrokerById,
  hasVerifiedEmailReceipt,
} from '../services/emailConnectionStore';
import { BUREAU_GUIDES } from '../components/ManualVerificationGuides';
import { BureauChecklistState } from './workspaceVault';
import { buildWebmasterCachePurgeNotice } from './searchDeindexEngine';

export type NukeTargetKind =
  | 'exposed_broker'
  | 'catalog_broker'
  | 'specialty_bureau'
  | 'webmaster_deindex';

export interface NukeTargetItem {
  id: string;
  kind: NukeTargetKind;
  brokerId?: string;
  bureauId?: string;
  deindexId?: string;
  brokerRef?: DataBroker;
  name: string;
  domain: string;
  categoryLabel: string;
  recipientEmail: string;
  fallbackEmails: string[];
  recommendedCcEmails: string[];
  optOutUrl: string;
  deliverabilityLabel: string;
  requiresPortalWarning: boolean;
  alreadyDispatched: boolean;
  subject: string;
  body: string;
}

export interface BuildNukeMatrixOptions {
  profile: UserProfile;
  senderEmail?: string;
  scanResults: ScanResult[];
  bureauProgress?: Record<string, BureauChecklistState>;
  deindexQueue?: DeindexItem[];
  contactOverrides?: Record<string, BrokerContactOverride>;
  includeExposedBrokers?: boolean;
  includeFullBrokerCatalog?: boolean;
  includeSpecialtyBureaus?: boolean;
  includeWebmasterDeindex?: boolean;
  includeAlreadyDispatched?: boolean;
  skipPortalPrimaryInboxes?: boolean;
}

export interface MassBccWebmailBatch {
  batchIndex: number;
  totalBatches: number;
  recipients: string[];
  targetNames: string[];
  subject: string;
  body: string;
  gmailUrl: string;
  outlookUrl: string;
  yahooUrl: string;
  mailtoUrl: string;
}

function extractHostnameSafe(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Builds the comprehensive NUKE ALL mass-removal target matrix across:
 *  1. Exposed data brokers & people-search websites from the user's active scan
 *  2. All remaining indexed data brokers & people-search websites in the registry
 *  3. Commercial specialty consumer bureaus, payroll clearinghouses & marketing registries
 *  4. Pending search-engine / webmaster cached URLs in the de-indexing queue
 */
export function buildNukeAllTargetMatrix(options: BuildNukeMatrixOptions): NukeTargetItem[] {
  const {
    profile,
    senderEmail,
    scanResults,
    bureauProgress = {},
    deindexQueue = [],
    contactOverrides,
    includeExposedBrokers = true,
    includeFullBrokerCatalog = true,
    includeSpecialtyBureaus = true,
    includeWebmasterDeindex = true,
    includeAlreadyDispatched = false,
    skipPortalPrimaryInboxes = false,
  } = options;

  const items: NukeTargetItem[] = [];
  const registry = getExhaustiveBrokerRegistry();
  const scanMap = new Map<string, ScanResult>();
  for (const res of scanResults) {
    scanMap.set(res.brokerId, res);
  }

  // 1 & 2. Data Brokers & People-Search Websites (Exposed Scan + Full Catalog)
  for (const broker of registry) {
    const existingResult = scanMap.get(broker.id);
    const isExposed = existingResult?.status === 'exposed';

    if (isExposed && !includeExposedBrokers) continue;
    if (!isExposed && !includeFullBrokerCatalog) continue;

    const contact = resolveBrokerContactProfile(broker, contactOverrides);
    if (!contact.effectivePrimaryEmail || !isValidEmailSyntax(contact.effectivePrimaryEmail)) {
      continue;
    }

    if (skipPortalPrimaryInboxes && contact.requiresPortalWarning) {
      continue;
    }

    const alreadyDispatched = Boolean(
      existingResult &&
        (hasVerifiedEmailReceipt(existingResult) || existingResult.removalStatus === 'removed')
    );

    if (alreadyDispatched && !includeAlreadyDispatched) {
      continue;
    }

    const notice = buildStatutoryNoticeForBroker(broker, profile, senderEmail);
    items.push({
      id: `broker:${broker.id}`,
      kind: isExposed ? 'exposed_broker' : 'catalog_broker',
      brokerId: broker.id,
      brokerRef: broker,
      name: broker.name,
      domain: broker.domain,
      categoryLabel: isExposed ? 'Exposed Data Broker' : 'Indexed Broker / Website',
      recipientEmail: contact.effectivePrimaryEmail,
      fallbackEmails: contact.fallbackEmails,
      recommendedCcEmails: contact.recommendedCcEmails,
      optOutUrl: broker.optOutUrl,
      deliverabilityLabel: contact.deliverabilityLabel,
      requiresPortalWarning: contact.requiresPortalWarning,
      alreadyDispatched,
      subject: notice.subject,
      body: notice.body,
    });
  }

  // 3. Commercial Specialty Bureaus, Clearinghouses & Direct-Mail Registries
  if (includeSpecialtyBureaus) {
    const fullName = `${profile.firstName} ${profile.lastName}`.trim() || 'Authorized Consumer';
    for (const bureau of BUREAU_GUIDES) {
      if (!bureau.complianceEmail || !isValidEmailSyntax(bureau.complianceEmail)) continue;
      // Never mass-blast government regulator inquiry desks (.gov) during automated broker nuke
      if (bureau.domain.toLowerCase().endsWith('.gov') || bureau.complianceEmail.toLowerCase().endsWith('.gov')) {
        continue;
      }

      const progress = bureauProgress[bureau.id];
      const alreadyDispatched = Boolean(progress?.emailSentReceipt || progress?.freezePlaced);
      if (alreadyDispatched && !includeAlreadyDispatched) {
        continue;
      }

      const body = bureau.letterTemplate(profile, senderEmail);
      const subject = `LEGAL NOTICE: Statutory Privacy Suppression & Marketing Opt-Out Demand - ${fullName}`;

      items.push({
        id: `bureau:${bureau.id}`,
        kind: 'specialty_bureau',
        bureauId: bureau.id,
        name: bureau.name,
        domain: bureau.domain,
        categoryLabel: bureau.category,
        recipientEmail: bureau.complianceEmail.trim().toLowerCase(),
        fallbackEmails: [],
        recommendedCcEmails: [],
        optOutUrl: bureau.portalUrl,
        deliverabilityLabel: 'Clearinghouse Compliance Desk',
        requiresPortalWarning: false,
        alreadyDispatched,
        subject,
        body,
      });
    }
  }

  // 4. Cached Website / Search Engine De-Index Queue Targets
  if (includeWebmasterDeindex && deindexQueue.length > 0) {
    for (const entry of deindexQueue) {
      const alreadyDispatched = Boolean(entry.emailReceipt || entry.status === 'deindexed');
      if (alreadyDispatched && !includeAlreadyDispatched) {
        continue;
      }

      const matchedBroker =
        (entry.brokerId ? findBrokerById(entry.brokerId) : undefined) ||
        registry.find((b) => {
          const host = extractHostnameSafe(entry.url);
          return host && (host === b.domain.toLowerCase() || host.endsWith(`.${b.domain.toLowerCase()}`));
        });

      const resolvedContact = matchedBroker
        ? resolveBrokerContactProfile(matchedBroker, contactOverrides)
        : null;

      const host = extractHostnameSafe(entry.url) || 'website';
      const recipientEmail =
        resolvedContact?.effectivePrimaryEmail ||
        (host.includes('.') ? `privacy@${host}` : '');

      if (!recipientEmail || !isValidEmailSyntax(recipientEmail)) {
        continue;
      }

      const purgeNotice = buildWebmasterCachePurgeNotice(
        entry.url,
        matchedBroker?.name || entry.brokerName || host,
        matchedBroker?.domain || host,
        recipientEmail,
        profile,
        senderEmail
      );

      items.push({
        id: `deindex:${entry.id}`,
        kind: 'webmaster_deindex',
        deindexId: entry.id,
        brokerId: matchedBroker?.id || entry.brokerId,
        name: `${matchedBroker?.name || entry.brokerName || host} (Cache Purge)`,
        domain: matchedBroker?.domain || host,
        categoryLabel: 'Website Cache & HTTP 410 Purge',
        recipientEmail,
        fallbackEmails: resolvedContact?.fallbackEmails || [],
        recommendedCcEmails: resolvedContact?.recommendedCcEmails || [],
        optOutUrl: matchedBroker?.optOutUrl || entry.url,
        deliverabilityLabel: resolvedContact?.deliverabilityLabel || 'Webmaster Privacy Desk',
        requiresPortalWarning: false,
        alreadyDispatched,
        subject: purgeNotice.subject,
        body: purgeNotice.body,
      });
    }
  }

  return items;
}

/**
 * Generates an omnibus multi-jurisdiction statutory deletion & permanent suppression demand
 * suitable for BCC mass-webmail dispatch across multiple data brokers and people-search websites.
 */
export function buildOmnibusMassDeletionNotice(
  profile: UserProfile,
  senderEmail?: string
): { subject: string; body: string } {
  const fullName = `${profile.firstName} ${profile.lastName}`.trim() || 'Authorized Consumer';
  const replyEmail = senderEmail || profile.emails[0] || '';
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const phonesLine =
    profile.phoneNumbers.filter(Boolean).join(', ') || 'All telephone numbers associated with name & address';
  const emailsLine =
    Array.from(new Set([replyEmail, ...profile.emails].filter(Boolean))).join(', ') || 'On file';
  const priorLocsLine =
    profile.previousLocations.filter(Boolean).join('; ') || 'None specified';
  const poaSection =
    profile.powerOfAttorney?.isSigned && profile.powerOfAttorney.authCode
      ? `\nAUTHORIZED AGENT & POWER OF ATTORNEY VERIFICATION:\n- Authorization Code: ${profile.powerOfAttorney.authCode}\n- Signed Date: ${profile.powerOfAttorney.signedDate}\n`
      : '';

  const subject = `STATUTORY DATA DELETION, DO-NOT-SELL & GLOBAL SUPPRESSION DEMAND (CCPA / CPRA / TDPSA / GDPR) - ${fullName}`;
  const body = `DATE: ${dateStr}
TO: Data Protection Officer, Privacy Compliance Desk & Website Suppression Operations
FROM: ${fullName}${replyEmail ? ` <${replyEmail}>` : ''}
RE: BINDING STATUTORY DEMAND FOR COMPLETE DATA ERASURE, OPT-OUT OF SALE/SHARING & PERMANENT SUPPRESSION

To Whom It May Concern:

I am exercising my statutory consumer privacy rights under the California Consumer Privacy Act & California Privacy Rights Act (Cal. Civ. Code §§ 1798.105, 1798.120 & SB 362 Delete Act), Texas Data Privacy and Security Act (Tex. Bus. & Com. Code § 541.051), Virginia CDPA, Colorado CPA, Connecticut CTDPA, Oregon OCPA, and GDPR Article 17 (where applicable).

I hereby demand that your organization, its parent company, subsidiaries, people-search websites, and downstream data syndication partners immediately:
1. DELETE and permanently expunge all personal records, background dossiers, contact profiles, property/court links, and identity-graph entries associated with my identifiers below.
2. OPT OUT my personal information from all commercial sale, licensing, API resale, cross-context behavioral advertising, and third-party sharing.
3. ADD my identifiers to your permanent internal Do-Not-Sell / Global Suppression list so re-ingested public or commercial feeds do not re-publish my profile, and serve HTTP 404/410 + X-Robots-Tag: noindex on any previously indexed profile URLs.

CONSUMER IDENTIFIERS FOR RECORD MATCHING ONLY (11 CCR § 7060):
- Full Legal Name: ${fullName}${profile.middleName ? ` (${profile.firstName} ${profile.middleName} ${profile.lastName})` : ''}
- Current Jurisdiction: ${profile.currentCity}, ${profile.currentState} ${profile.currentZip || ''}
- Year of Birth: ${profile.birthYear || 'On file'}
- Associated Phone(s): ${phonesLine}
- Associated Email(s): ${emailsLine}
- Prior Jurisdictions: ${priorLocsLine}${poaSection}
Under Cal. Code Regs. tit. 11, § 7060, you may not require government-issued photo ID or additional sensitive data when my profile can be matched from existing public directory fields. Please confirm permanent deletion and suppression in writing${replyEmail ? ` to ${replyEmail}` : ''} within the statutory compliance window (45 calendar days maximum).

Sincerely,
${fullName}`;

  return { subject, body };
}

/**
 * Groups targets into URL-safe BCC webmail batches so users can also mass-email all brokers
 * in 1 click via Gmail Web, Outlook.com, Yahoo Mail, or their default mail client.
 */
export function buildMassBccWebmailBatches(
  targets: NukeTargetItem[],
  profile: UserProfile,
  senderEmail?: string,
  maxPerBatch = 18
): MassBccWebmailBatch[] {
  const seen = new Set<string>();
  const deduped: { email: string; name: string }[] = [];

  for (const t of targets) {
    const clean = t.recipientEmail.trim().toLowerCase();
    if (!isValidEmailSyntax(clean) || seen.has(clean)) continue;
    seen.add(clean);
    deduped.push({ email: clean, name: t.name });
  }

  if (deduped.length === 0) return [];

  const safeBatchSize = Math.max(1, Math.min(30, maxPerBatch));
  const totalBatches = Math.ceil(deduped.length / safeBatchSize);
  const { subject, body } = buildOmnibusMassDeletionNotice(profile, senderEmail);
  const selfRecipient =
    senderEmail && isValidEmailSyntax(senderEmail)
      ? senderEmail.trim().toLowerCase()
      : profile.emails[0] && isValidEmailSyntax(profile.emails[0])
      ? profile.emails[0].trim().toLowerCase()
      : '';

  const batches: MassBccWebmailBatch[] = [];

  for (let i = 0; i < totalBatches; i++) {
    const slice = deduped.slice(i * safeBatchSize, (i + 1) * safeBatchSize);
    const recipients = slice.map((s) => s.email);
    const targetNames = slice.map((s) => s.name);
    const toAddr = selfRecipient || recipients[0];
    const bccList = selfRecipient ? recipients : recipients.slice(1);

    const encTo = encodeURIComponent(toAddr);
    const encBcc = encodeURIComponent(bccList.join(','));
    const encSub = encodeURIComponent(subject);
    const encBody = encodeURIComponent(body);

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encTo}${
      bccList.length > 0 ? `&bcc=${encBcc}` : ''
    }&su=${encSub}&body=${encBody}`;

    const outlookUrl = `https://outlook.live.com/mail/0/deeplink/compose?to=${encTo}${
      bccList.length > 0 ? `&bcc=${encBcc}` : ''
    }&subject=${encSub}&body=${encBody}`;

    const yahooUrl = `https://compose.mail.yahoo.com/?to=${encTo}${
      bccList.length > 0 ? `&bcc=${encBcc}` : ''
    }&subj=${encSub}&body=${encBody}`;

    const mailtoUrl = `mailto:${encTo}?${
      bccList.length > 0 ? `bcc=${encBcc}&` : ''
    }subject=${encSub}&body=${encBody}`;

    batches.push({
      batchIndex: i + 1,
      totalBatches,
      recipients,
      targetNames,
      subject,
      body,
      gmailUrl,
      outlookUrl,
      yahooUrl,
      mailtoUrl,
    });
  }

  return batches;
}
