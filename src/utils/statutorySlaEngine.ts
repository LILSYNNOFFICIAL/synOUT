import { DataBroker, ScanResult, UserProfile } from '../types';
import { getBrokerRecordSearchUrl } from './scanEngine';

export type SlaLifecycleState =
  | 'scrubbed'
  | 'unsubmitted'
  | 'on_track'
  | 'approaching_deadline'
  | 'overdue';

export interface BrokerSlaEvaluation {
  state: SlaLifecycleState;
  statutoryWindowDays: number;
  daysElapsed: number;
  daysRemaining: number;
  submittedDateLabel: string | null;
  deadlineDateLabel: string | null;
  deadlineDate: Date | null;
}

export type RegulatoryAgencyId = 'CPPA' | 'TX_AG' | 'FTC' | 'CO_AG' | 'EU_DPA';

export interface RegulatoryAgencyMeta {
  id: RegulatoryAgencyId;
  name: string;
  shortName: string;
  jurisdiction: string;
  statute: string;
  complaintPortalUrl: string;
  penaltyCitation: string;
}

export const REGULATORY_AGENCIES: RegulatoryAgencyMeta[] = [
  {
    id: 'CPPA',
    name: 'California Privacy Protection Agency (CPPA)',
    shortName: 'CA CPPA',
    jurisdiction: 'California / Registered Data Brokers',
    statute: 'Cal. Civ. Code § 1798.105, § 1798.120 & Delete Act (SB 362)',
    complaintPortalUrl: 'https://cppa.ca.gov/webapplications/complaint',
    penaltyCitation: 'Cal. Civ. Code § 1798.199.90 ($2,500–$7,500 per administrative violation)',
  },
  {
    id: 'TX_AG',
    name: 'Texas Attorney General — Consumer Protection Division',
    shortName: 'Texas OAG',
    jurisdiction: 'Texas (TDPSA & Data Broker Registry)',
    statute: 'Tex. Bus. & Com. Code § 541.051 & Ch. 509 Data Broker Act',
    complaintPortalUrl: 'https://www.texasattorneygeneral.gov/consumer-protection/file-consumer-complaint',
    penaltyCitation: 'Tex. Bus. & Com. Code § 541.155 (Up to $7,500 per statutory violation)',
  },
  {
    id: 'FTC',
    name: 'Federal Trade Commission (FTC Bureau of Consumer Protection)',
    shortName: 'US FTC',
    jurisdiction: 'United States Federal',
    statute: 'FTC Act Section 5 (15 U.S.C. § 45) & FCRA (15 U.S.C. § 1681)',
    complaintPortalUrl: 'https://reportfraud.ftc.gov/',
    penaltyCitation: '15 U.S.C. § 45(m) Unfair or Deceptive Data Brokerage Practices',
  },
  {
    id: 'CO_AG',
    name: 'Colorado Attorney General — Privacy Enforcement',
    shortName: 'Colorado AG',
    jurisdiction: 'Colorado / US State Omnibus',
    statute: 'Colorado Privacy Act (C.R.S. § 6-1-1306)',
    complaintPortalUrl: 'https://coag.gov/file-complaint/',
    penaltyCitation: 'C.R.S. § 6-1-112 (Up to $20,000 per CPA violation)',
  },
  {
    id: 'EU_DPA',
    name: 'European Data Protection Supervisory Authority (GDPR Art. 77)',
    shortName: 'EU DPA',
    jurisdiction: 'EEA / UK Cross-Border',
    statute: 'GDPR (EU) 2016/679 Art. 17 (Erasure), Art. 12(3) & Art. 77',
    complaintPortalUrl: 'https://www.edpb.europa.eu/about-edpb/about-edpb/members_en',
    penaltyCitation: 'GDPR Art. 83(5) Administrative Fines',
  },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseSubmissionTimestamp(result: ScanResult): number | null {
  if (result.submittedAtIso) {
    const parsedIso = Date.parse(result.submittedAtIso);
    if (!Number.isNaN(parsedIso)) return parsedIso;
  }
  if (result.submissionDate) {
    const parsedDate = Date.parse(result.submissionDate);
    if (!Number.isNaN(parsedDate)) return parsedDate;
  }
  return null;
}

export function computeBrokerSlaStatus(
  result: ScanResult,
  nowMs: number = Date.now(),
  statutoryWindowDays = 45
): BrokerSlaEvaluation {
  if (result.removalStatus === 'removed') {
    return {
      state: 'scrubbed',
      statutoryWindowDays,
      daysElapsed: 0,
      daysRemaining: 0,
      submittedDateLabel: result.submissionDate || null,
      deadlineDateLabel: null,
      deadlineDate: null,
    };
  }

  const submittedMs = parseSubmissionTimestamp(result);
  if (result.removalStatus !== 'submitted' || submittedMs === null) {
    return {
      state: 'unsubmitted',
      statutoryWindowDays,
      daysElapsed: 0,
      daysRemaining: statutoryWindowDays,
      submittedDateLabel: null,
      deadlineDateLabel: null,
      deadlineDate: null,
    };
  }

  const rawElapsed = Math.max(0, Math.floor((nowMs - submittedMs) / MS_PER_DAY));
  const remaining = statutoryWindowDays - rawElapsed;
  const deadlineMs = submittedMs + statutoryWindowDays * MS_PER_DAY;
  const deadlineDate = new Date(deadlineMs);

  const submittedDateLabel = new Date(submittedMs).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const deadlineDateLabel = deadlineDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  let state: SlaLifecycleState = 'on_track';
  if (remaining <= 0) {
    state = 'overdue';
  } else if (remaining <= 7) {
    state = 'approaching_deadline';
  }

  return {
    state,
    statutoryWindowDays,
    daysElapsed: rawElapsed,
    daysRemaining: remaining,
    submittedDateLabel,
    deadlineDateLabel,
    deadlineDate,
  };
}

export function buildStatutoryEscalationNotice(
  broker: DataBroker,
  result: ScanResult,
  profile: UserProfile,
  senderEmailOverride?: string
): { subject: string; body: string } {
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const primaryEmail = senderEmailOverride || profile.emails[0] || 'consumer@example.com';
  const sla = computeBrokerSlaStatus(result);
  const priorDate = sla.submittedDateLabel || result.submissionDate || 'Prior Notice';
  const priorReceipt = result.optOutConfirmationCode || 'Prior Electronic Demand';
  const noticeCount = (result.escalationCount || 0) + 2;

  const todayStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const poaClause = profile.powerOfAttorney?.isSigned
    ? `\nAUTHORIZED REPRESENTATION:\n- Signed Power of Attorney Certificate: ${profile.powerOfAttorney.authCode} (${profile.powerOfAttorney.signedDate})\n`
    : '';

  const overdueClause =
    sla.state === 'overdue'
      ? `STATUTORY DEFAULT NOTICE: ${sla.daysElapsed} calendar days have elapsed since my verified deletion demand was transmitted on ${priorDate}, exceeding the 45-day statutory compliance period.`
      : `STATUTORY COMPLIANCE FOLLOW-UP: ${sla.daysElapsed} calendar days have elapsed since my verified deletion demand was transmitted on ${priorDate} (${Math.max(0, sla.daysRemaining)} calendar days remaining until statutory deadline ${sla.deadlineDateLabel || ''}).`;

  const subject = `SECOND STATUTORY NOTICE (#${noticeCount}): Non-Compliance & Pre-Enforcement Escalation - ${fullName} [Ref: ${priorReceipt}]`;

  const body = `DATE: ${todayStr}
TO: Chief Privacy Officer & Legal Compliance Desk, ${broker.name} (${broker.privacyEmail || broker.domain})
FROM: ${fullName} <${primaryEmail}>
RE: FORMAL STATUTORY FOLLOW-UP & PRE-ENFORCEMENT CURE NOTICE
PRIOR TRANSMISSION DATE: ${priorDate}
PRIOR DELIVERY RECEIPT / MESSAGE-ID: ${priorReceipt}

To the Privacy Compliance Officer of ${broker.name}:

${overdueClause}

Despite prior formal notice under Cal. Civ. Code § 1798.105, § 1798.120, Tex. Bus. & Com. Code § 541.051, and applicable state consumer privacy laws, public inspection indicates that records associated with my identity remain unexpunged or unconfirmed on ${broker.domain}.

SUBJECT IDENTIFIERS REQUIRING IMMEDIATE SUPPRESSION:
- Full Legal Name: ${fullName}
- Primary Jurisdiction: ${profile.currentCity}, ${profile.currentState} ${profile.currentZip || ''}
- Primary Phone: ${profile.phoneNumbers[0] || 'On record'}
- Primary Email: ${primaryEmail}
- Target Listing URL: ${getBrokerRecordSearchUrl(broker, profile)}
${poaClause}
FINAL PRE-COMPLAINT DEMAND:
1. Purge all consumer dossiers, telephone/address histories, and downstream syndication feeds for the above identity immediately.
2. Add these identifiers to your permanent suppression registry to prevent re-ingestion.
3. Reply in writing to ${primaryEmail} within ten (10) business days confirming complete deletion.

If written confirmation is not received, this evidentiary record—including outbound SMTP Message-ID ${priorReceipt}—will be submitted to the California Privacy Protection Agency (CPPA), the State Attorney General, and the Federal Trade Commission for statutory enforcement pursuant to Cal. Civ. Code § 1798.199.90.

Sincerely,
${fullName}
Consumer & Data Subject`;

  return { subject, body };
}

export function buildRegulatoryComplaintDossier(
  agencyId: RegulatoryAgencyId,
  broker: DataBroker,
  result: ScanResult,
  profile: UserProfile,
  senderEmail?: string
): string {
  const agency =
    REGULATORY_AGENCIES.find((a) => a.id === agencyId) || REGULATORY_AGENCIES[0];
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const sla = computeBrokerSlaStatus(result);
  const contactEmail = senderEmail || profile.emails[0] || 'Not specified';
  const generatedAt = new Date().toISOString();

  return [
    `========================================================================`,
    `FORMAL CONSUMER PRIVACY REGULATORY ENFORCEMENT COMPLAINT DOSSIER`,
    `========================================================================`,
    `TARGET ENFORCEMENT AGENCY: ${agency.name}`,
    `FILING PORTAL:             ${agency.complaintPortalUrl}`,
    `GOVERNING STATUTE:         ${agency.statute}`,
    `ENFORCEMENT CITATION:      ${agency.penaltyCitation}`,
    `GENERATED TIMESTAMP:       ${generatedAt}`,
    ``,
    `1. COMPLAINANT (DATA SUBJECT) INFORMATION`,
    `------------------------------------------------------------------------`,
    `Full Legal Name:           ${fullName}`,
    `Municipality & State:      ${profile.currentCity}, ${profile.currentState} ${profile.currentZip || ''}`,
    `Verified Contact Email:    ${contactEmail}`,
    `Primary Phone:             ${profile.phoneNumbers[0] || 'On file'}`,
    profile.powerOfAttorney?.isSigned
      ? `Authorized Agent POA:      ${profile.powerOfAttorney.authCode} (Signed ${profile.powerOfAttorney.signedDate})`
      : `Authorized Agent POA:      Direct Consumer Filing`,
    ``,
    `2. RESPONDENT (DATA BROKER) INFORMATION`,
    `------------------------------------------------------------------------`,
    `Entity Name:               ${broker.name}`,
    `Primary Web Domain:        ${broker.domain}`,
    `Category:                  ${broker.category}`,
    `Designated Privacy Email:  ${broker.privacyEmail || 'Not disclosed'}`,
    `Official Opt-Out URL:      ${broker.optOutUrl}`,
    `Live Subject Record URL:   ${getBrokerRecordSearchUrl(broker, profile)}`,
    `Exposed PII Categories:    ${broker.dataExposedList.join(', ')}`,
    ``,
    `3. CHRONOLOGICAL EVIDENTIARY AUDIT TRAIL`,
    `------------------------------------------------------------------------`,
    `Initial Demand Date:       ${sla.submittedDateLabel || result.submissionDate || 'Not yet transmitted'}`,
    `SMTP / Portal Receipt:     ${result.optOutConfirmationCode || 'Pending'}`,
    `Days Elapsed Since Notice: ${sla.daysElapsed} calendar days`,
    `Statutory SLA Status:      ${sla.state.toUpperCase()} (${sla.statutoryWindowDays}-day statutory window)`,
    `Follow-Up Escalations:     ${result.escalationCount || 0}${result.lastEscalationReceipt ? ` (Last Receipt: ${result.lastEscalationReceipt})` : ''}`,
    ``,
    `4. STATEMENT OF ALLEGED VIOLATION`,
    `------------------------------------------------------------------------`,
    `Complainant transmitted a verifiable statutory consumer deletion and opt-out-of-sale`,
    `demand to Respondent ${broker.name} (${broker.domain}) at ${broker.privacyEmail || broker.optOutUrl}.`,
    `Respondent continues to display, license, or sell Complainant's personal identifiable`,
    `information without consent and has failed to confirm complete suppression across its`,
    `public directory and downstream syndication feeds within statutory mandates.`,
    ``,
    `5. REQUESTED REGULATORY RELIEF`,
    `------------------------------------------------------------------------`,
    `- Order Respondent ${broker.name} to permanently delete and suppress Complainant's PII.`,
    `- Audit Respondent's compliance with statutory 45-day deletion timelines and opt-out registries.`,
    `- Assess applicable administrative penalties under ${agency.penaltyCitation}.`,
    ``,
    `I declare that the foregoing evidentiary log is true and accurate to the best of my knowledge.`,
    `Signed: ${fullName}`,
    `Date:   ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    `========================================================================`,
  ].join('\r\n');
}

function escapeIcsText(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function formatIcsUtcTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export interface IcsEventParams {
  uid?: string;
  title: string;
  description: string;
  startDate: Date;
  durationMinutes?: number;
  url?: string;
}

export function generateIcsCalendarEvent(params: IcsEventParams): string {
  const durationMs = (params.durationMinutes || 30) * 60 * 1000;
  const endDate = new Date(params.startDate.getTime() + durationMs);
  const uid =
    params.uid || `synout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@synout.privacy`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//synOUT Privacy Engine//Statutory SLA Audit//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsUtcTimestamp(new Date())}`,
    `DTSTART:${formatIcsUtcTimestamp(params.startDate)}`,
    `DTEND:${formatIcsUtcTimestamp(endDate)}`,
    `SUMMARY:${escapeIcsText(params.title)}`,
    `DESCRIPTION:${escapeIcsText(params.description)}`,
  ];

  if (params.url) {
    lines.push(`URL:${params.url}`);
  }

  lines.push(
    'BEGIN:VALARM',
    'TRIGGER:-PT24H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(params.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  );

  return lines.join('\r\n');
}
