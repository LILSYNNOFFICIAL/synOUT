import { DataBroker, ScanResult } from '../types';
import { hasVerifiedEmailReceipt } from '../services/emailConnectionStore';
import { hasWebFormSubmission } from './optOutFormEngine';
import { calculateOptOutTimeline } from './optOutTimelineEngine';

export type PrivacyTacticCategoryCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export interface PrivacyTacticRecommendation {
  id: string;
  categoryCode: PrivacyTacticCategoryCode;
  categoryLabel: string;
  title: string;
  riskExplanation: string;
  recommendedAction: string;
  limitationOrCondition: string;
  evidenceBasis: 'verified_broker_doc' | 'general_guidance';
  sourceLabel: string;
  sourceUrl: string | null;
}

export interface BrokerPrivacyTacticsDossier {
  brokerId: string;
  brokerName: string;
  brokerDomain: string;
  riskLevel: string;
  category: string;
  hasVerifiedBrokerDocumentation: boolean;
  riskSummary: string;
  optOutStatusLabel: string;
  officialOptOutUrl: string | null;
  documentedChannelSummary: string;
  recommendations: PrivacyTacticRecommendation[];
}

function getSafeExternalHttpsUrl(raw?: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('https://')) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function isBrokerDocumentationVerified(broker: DataBroker): boolean {
  const verifiedProvenance =
    broker.provenanceSource === 'cpra_data_broker_registry' ||
    broker.provenanceSource === 'verified_privacy_portal' ||
    broker.provenanceSource === 'parent_network_dpo';

  const hasInstructions = Array.isArray(broker.instructions) && broker.instructions.length > 0;
  const hasHttpsOptOut = Boolean(getSafeExternalHttpsUrl(broker.optOutUrl));

  return Boolean(verifiedProvenance && hasInstructions && hasHttpsOptOut);
}

/**
 * Generates actionable, non-deceptive, broker-grounded Privacy Tactics (Categories A–G)
 * for a specific DataBroker and its optional ScanResult.
 * Clearly distinguishes documented broker requirements from general privacy guidance.
 */
export function buildBrokerPrivacyTactics(
  broker: DataBroker,
  result?: ScanResult | null,
  effectiveOptOutUrlOverride?: string
): BrokerPrivacyTacticsDossier {
  const hasVerifiedDoc = isBrokerDocumentationVerified(broker);
  const officialOptOutUrl =
    getSafeExternalHttpsUrl(effectiveOptOutUrlOverride) ||
    getSafeExternalHttpsUrl(broker.optOutUrl);

  const verifiedSourceLabel = "Source: Broker's official opt-out instructions";
  const generalSourceLabel =
    "General privacy recommendation. Verify this broker's requirements before proceeding.";

  // Compute current opt-out request status honestly
  let optOutStatusLabel = 'Not Yet Submitted';
  let hasRecordedSubmission = false;
  if (result) {
    const emailSent = hasVerifiedEmailReceipt(result);
    const formSent = hasWebFormSubmission(result);
    const timeline = calculateOptOutTimeline(result);
    if (timeline.phase === 'confirmed_removed') {
      optOutStatusLabel = 'Confirmed Removed';
      hasRecordedSubmission = true;
    } else if (timeline.phase === 'failed' || timeline.phase === 'rejected' || timeline.phase === 'cancelled') {
      optOutStatusLabel = timeline.statusHeadline;
    } else if (emailSent || formSent || result.removalStatus === 'submitted') {
      hasRecordedSubmission = true;
      optOutStatusLabel =
        timeline.expectedRemovalDateFormatted
          ? `${timeline.statusHeadline} (Est. ${timeline.expectedRemovalDateFormatted})`
          : timeline.statusHeadline;
    }
  }

  const exposedSummary =
    broker.dataExposedList && broker.dataExposedList.length > 0
      ? broker.dataExposedList.slice(0, 5).join(', ')
      : 'name, address, and contact directory attributes';

  const riskSummary = `${broker.name} (${broker.domain}) operates in the ${broker.category} category (${broker.risk} risk) and commonly indexes ${exposedSummary}.`;

  // Channel summary grounded in actual broker fields
  const channelParts: string[] = [`Primary method: ${broker.removalMethod}`];
  if (broker.privacyEmail) {
    channelParts.push(`Documented privacy email: ${broker.privacyEmail}`);
  }
  if (broker.requiresProfileUrl) {
    channelParts.push('Requires direct listing profile URL');
  }
  if (broker.requiresEmailVerification) {
    channelParts.push('Requires email link confirmation');
  }
  if (broker.requiresPhoneVerification) {
    channelParts.push('Requires phone code verification');
  }
  const documentedChannelSummary = hasVerifiedDoc
    ? channelParts.join(' · ')
    : `Catalog method listed as ${broker.removalMethod}; specific portal requirements for ${broker.name} have not been independently verified—review the broker's official page before submitting.`;

  const recommendations: PrivacyTacticRecommendation[] = [
    // A. Minimize Information Provided
    {
      id: `${broker.id}-tactic-a-minimize`,
      categoryCode: 'A',
      categoryLabel: 'A. Minimize Information Provided',
      title: broker.requiresProfileUrl
        ? `Supply Your Direct ${broker.name} Listing URL & Skip Optional Fields`
        : `Provide Only Fields Needed to Locate Your ${broker.name} Record`,
      riskExplanation:
        'Opt-out forms sometimes include optional fields (such as secondary phone numbers, workplace details, or middle names) that could expand what the broker holds if unnecessary.',
      recommendedAction: broker.requiresProfileUrl
        ? `Locate your specific profile URL on ${broker.domain} first, submit that exact URL along with required contact fields, and leave optional fields blank when the form permits.`
        : `Enter only the required fields needed to uniquely match your listing on ${broker.name} (typically full name and city/state, plus required verification contact), leaving optional fields blank when permitted.`,
      limitationOrCondition:
        'Always provide enough accurate information for the broker to distinguish your record from other individuals with a similar name and process a legitimate request.',
      evidenceBasis: hasVerifiedDoc ? 'verified_broker_doc' : 'general_guidance',
      sourceLabel: hasVerifiedDoc ? verifiedSourceLabel : generalSourceLabel,
      sourceUrl: hasVerifiedDoc ? officialOptOutUrl : null,
    },

    // B. Date of Birth Requests
    {
      id: `${broker.id}-tactic-b-dob`,
      categoryCode: 'B',
      categoryLabel: 'B. Date of Birth Requests',
      title: 'Handle Age & Date of Birth Fields Carefully',
      riskExplanation:
        'An exact date of birth is a sensitive personal identifier that increases identity-exposure risk if disclosed when not required.',
      recommendedAction:
        'Check whether the opt-out process marks Date of Birth as optional or accepts an age band or birth year instead. If the broker accepts an approximate age or does not require an exact date for verification, avoid disclosing your full month/day/year. If an exact date of birth is strictly required, review the official privacy policy or documented privacy email channel before deciding whether to proceed.',
      limitationOrCondition:
        'Never falsify identity information, evade mandatory identity verification, or submit misleading dates where an exact date of birth is required for verification.',
      evidenceBasis: 'general_guidance',
      sourceLabel: generalSourceLabel,
      sourceUrl: officialOptOutUrl,
    },

    // C. Email Privacy
    {
      id: `${broker.id}-tactic-c-email`,
      categoryCode: 'C',
      categoryLabel: 'C. Email Privacy',
      title: broker.requiresEmailVerification
        ? 'Use a Dedicated Privacy Alias With Active Inbox Access'
        : 'Use a Dedicated Privacy Request Email or Alias',
      riskExplanation:
        'Submitting your primary personal or work email on dozens of opt-out portals exposes that address to additional correspondence.',
      recommendedAction: broker.requiresEmailVerification
        ? `${broker.name} sends an email confirmation link to finalize opt-out requests. Use a dedicated privacy email address or forwarding alias whose inbox you actively monitor so you can open the confirmation link.`
        : `Where permitted, submit opt-out requests using a dedicated privacy email address or alias rather than your primary personal inbox, while keeping that address reachable for confirmation or follow-up replies.`,
      limitationOrCondition:
        'Do not use a disposable or unreachable address that expires before verification links or broker follow-up notices arrive.',
      evidenceBasis:
        hasVerifiedDoc && broker.requiresEmailVerification
          ? 'verified_broker_doc'
          : 'general_guidance',
      sourceLabel:
        hasVerifiedDoc && broker.requiresEmailVerification
          ? verifiedSourceLabel
          : generalSourceLabel,
      sourceUrl:
        hasVerifiedDoc && broker.requiresEmailVerification ? officialOptOutUrl : null,
    },

    // D. Identity Verification
    {
      id: `${broker.id}-tactic-d-verification`,
      categoryCode: 'D',
      categoryLabel: 'D. Identity Verification',
      title: broker.requiresPhoneVerification
        ? `Prepare for ${broker.name} Telephone Code Verification`
        : 'Review Verification Rules & Redact Non-Required ID Fields',
      riskExplanation:
        'Some data brokers and specialty consumer reporting agencies request phone verification or identity documents before suppressing sensitive records.',
      recommendedAction: broker.requiresPhoneVerification
        ? `${broker.name}'s documented suppression flow uses a one-time telephone verification code. Confirm you are on the official ${broker.domain} domain before entering a phone number to receive the verification code.`
        : 'Before uploading any identity document, verify on the official privacy page that ID verification is genuinely required for an opt-out (many state privacy rules restrict ID collection when email/URL matching suffices). Where ID upload is required and the broker permits redaction, black out your ID number, barcode, and photo while keeping name and address legible.',
      limitationOrCondition:
        "Only redact fields when permitted by the broker's documented rules. Never attempt to bypass mandatory verification or submit another person's documents.",
      evidenceBasis:
        hasVerifiedDoc && broker.requiresPhoneVerification
          ? 'verified_broker_doc'
          : 'general_guidance',
      sourceLabel:
        hasVerifiedDoc && broker.requiresPhoneVerification
          ? verifiedSourceLabel
          : generalSourceLabel,
      sourceUrl:
        hasVerifiedDoc && broker.requiresPhoneVerification ? officialOptOutUrl : null,
    },

    // E. Request Documentation
    {
      id: `${broker.id}-tactic-e-documentation`,
      categoryCode: 'E',
      categoryLabel: 'E. Request Documentation',
      title: 'Retain Submission Dates, Receipts & Confirmation Tickets',
      riskExplanation:
        'Without a recorded submission timestamp or confirmation ticket, it is difficult to follow up if a listing remains online weeks later.',
      recommendedAction: hasRecordedSubmission
        ? `synOUT currently tracks an active submission record for ${broker.name} (${optOutStatusLabel}). Keep any confirmation email or ticket number in your records alongside your Exposure Report export.`
        : `No opt-out submission is currently recorded in synOUT for ${broker.name}. When you submit a request, save the confirmation screen, ticket number, or sent email receipt so the 45-day tracking timeline can monitor progress.`,
      limitationOrCondition:
        'Not all brokers issue confirmation numbers on web forms; saving a timestamped screenshot or sent-email Message-ID provides practical proof of submission.',
      evidenceBasis: hasVerifiedDoc ? 'verified_broker_doc' : 'general_guidance',
      sourceLabel: hasVerifiedDoc ? verifiedSourceLabel : generalSourceLabel,
      sourceUrl: hasVerifiedDoc ? officialOptOutUrl : null,
    },

    // F. Follow-Up Strategy
    {
      id: `${broker.id}-tactic-f-followup`,
      categoryCode: 'F',
      categoryLabel: 'F. Follow-Up Strategy',
      title: 'Verify Live Removal & Follow Up If Past the 45-Day Estimate',
      riskExplanation:
        'Submitting an opt-out request does not guarantee immediate removal, and search-engine caches may lag behind a broker database update.',
      recommendedAction: broker.privacyEmail
        ? `Check ${broker.domain} after the broker's typical processing window (${broker.removalTime || 'up to 45 days'}). If your listing remains live past the 45-calendar-day planning estimate, send a documented follow-up referencing your original submission date to ${broker.privacyEmail} or through the official opt-out portal.`
        : `Re-check your listing on ${broker.domain} once the estimated processing window passes. If the record is still public after 45 calendar days, follow up through the broker's official privacy request channel.`,
      limitationOrCondition:
        'A 45-day follow-up benchmark is a planning estimate—statutory response deadlines (such as 45 days under CCPA/TDPSA, often extendable by an additional period upon notice) depend on your residency and whether the entity is covered by that statute.',
      evidenceBasis: hasVerifiedDoc ? 'verified_broker_doc' : 'general_guidance',
      sourceLabel: hasVerifiedDoc ? verifiedSourceLabel : generalSourceLabel,
      sourceUrl: officialOptOutUrl,
    },

    // G. Information Reappearing
    {
      id: `${broker.id}-tactic-g-reappearance`,
      categoryCode: 'G',
      categoryLabel: 'G. Information Reappearing',
      title: broker.parentEntity
        ? `Monitor ${broker.name} (${broker.parentEntity}) for Re-Ingested Records`
        : `Schedule Periodic Re-Checks on ${broker.name}`,
      riskExplanation:
        'Data brokers periodically refresh records from county property filings, utility headers, and commercial marketing feeds, which can create a new profile even after a prior opt-out.',
      recommendedAction: broker.parentEntity
        ? `${broker.name} is affiliated with ${broker.parentEntity}. Check whether the official portal offers a network-wide suppression option, and re-check every 30–90 days in Re-Listing Monitor to catch newly acquired records.`
        : `Use periodic 30–90 day re-scans to check whether ${broker.name} has re-indexed your information under a new address or phone variation, and submit a repeat suppression request if needed.`,
      limitationOrCondition:
        'External brokers control their own upstream data feeds; neither synOUT nor a single opt-out can guarantee that information will never reappear.',
      evidenceBasis:
        hasVerifiedDoc && Boolean(broker.parentEntity)
          ? 'verified_broker_doc'
          : 'general_guidance',
      sourceLabel:
        hasVerifiedDoc && Boolean(broker.parentEntity)
          ? verifiedSourceLabel
          : generalSourceLabel,
      sourceUrl: officialOptOutUrl,
    },
  ];

  // Prioritize verified broker-specific tactics first while preserving clear logical order
  const prioritized = [
    ...recommendations.filter((r) => r.evidenceBasis === 'verified_broker_doc'),
    ...recommendations.filter((r) => r.evidenceBasis === 'general_guidance'),
  ];

  return {
    brokerId: broker.id,
    brokerName: broker.name,
    brokerDomain: broker.domain,
    riskLevel: broker.risk,
    category: broker.category,
    hasVerifiedBrokerDocumentation: hasVerifiedDoc,
    riskSummary,
    optOutStatusLabel,
    officialOptOutUrl,
    documentedChannelSummary,
    recommendations: prioritized,
  };
}

export function formatPrivacyTacticForClipboard(
  brokerName: string,
  tactic: PrivacyTacticRecommendation
): string {
  return [
    `[${brokerName}] ${tactic.categoryLabel} — ${tactic.title}`,
    `Risk: ${tactic.riskExplanation}`,
    `Action: ${tactic.recommendedAction}`,
    `Note: ${tactic.limitationOrCondition}`,
    tactic.sourceUrl ? `${tactic.sourceLabel} (${tactic.sourceUrl})` : tactic.sourceLabel,
  ].join('\n');
}

export function formatPrivacyChecklistForClipboard(
  dossier: BrokerPrivacyTacticsDossier
): string {
  const lines: string[] = [
    `synOUT Privacy Tactics Checklist — ${dossier.brokerName} (${dossier.brokerDomain})`,
    `Current Opt-Out Status: ${dossier.optOutStatusLabel}`,
    dossier.officialOptOutUrl
      ? `Official Opt-Out Instructions: ${dossier.officialOptOutUrl}`
      : 'Official Opt-Out Instructions: Verify on broker website',
    '------------------------------------------------------------',
  ];

  for (const item of dossier.recommendations) {
    lines.push(`[ ] ${item.categoryLabel}: ${item.title}`);
    lines.push(`    Action: ${item.recommendedAction}`);
    lines.push(`    Condition: ${item.limitationOrCondition}`);
    lines.push(`    Basis: ${item.sourceLabel}`);
    lines.push('');
  }

  return lines.join('\n').trim();
}
