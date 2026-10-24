import { ScanResult, UserProfile } from '../types';
import { findBrokerById, hasVerifiedEmailReceipt } from '../services/emailConnectionStore';
import { computeBrokerSlaStatus } from './statutorySlaEngine';

export async function sha256Hex(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const bytes = new TextEncoder().encode(input);
    const digest = await subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Deterministic fallback hash only if Web Crypto is unavailable
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0')
  ).repeat(4);
}

export interface BrokerPenaltyLineItem {
  brokerId: string;
  brokerName: string;
  brokerDomain: string;
  daysOverdue: number;
  isIntentionalOrRepeat: boolean;
  violationBasis: string;
  conservativePenaltyUsd: number;
  maximumPenaltyUsd: number;
  deleteActDailyFineUsd: number;
}

export interface StatutoryDamagesSummary {
  applicableStatuteLabel: string;
  actionedCount: number;
  overdueCount: number;
  intentionalOrRepeatCount: number;
  totalConservativeUsd: number;
  totalMaximumUsd: number;
  totalDeleteActAccruedUsd: number;
  lineItems: BrokerPenaltyLineItem[];
}

export function computeStatutoryDamagesEstimate(
  results: ScanResult[],
  stateCode = 'CA',
  nowMs: number = Date.now()
): StatutoryDamagesSummary {
  const normalizedState = (stateCode || 'CA').trim().toUpperCase();

  let applicableStatuteLabel =
    'CA CCPA/CPRA (Cal. Civ. Code § 1798.155: $2,500–$7,500/violation) & Delete Act SB 362 ($200/day)';
  let maxPerViolation = 7500;
  const basePerViolation = 2500;

  if (normalizedState === 'TX') {
    applicableStatuteLabel =
      'Texas TDPSA (Tex. Bus. & Com. Code § 541.155: up to $7,500 per statutory violation)';
    maxPerViolation = 7500;
  } else if (normalizedState === 'CO') {
    applicableStatuteLabel =
      'Colorado Privacy Act (C.R.S. § 6-1-112: up to $20,000 per CPA violation)';
    maxPerViolation = 20000;
  } else if (normalizedState !== 'CA') {
    applicableStatuteLabel =
      'US State Omnibus Privacy Enforcement & CCPA/Delete Act National Broker Registry ($2,500–$7,500/violation)';
  }

  const lineItems: BrokerPenaltyLineItem[] = [];
  let actionedCount = 0;

  for (const item of results) {
    if (
      item.removalStatus === 'submitted' ||
      item.removalStatus === 'removed' ||
      item.isRegression
    ) {
      actionedCount++;
    }

    const sla = computeBrokerSlaStatus(item, nowMs, 45);
    const isOverdue = item.removalStatus !== 'removed' && sla.state === 'overdue';
    const isRegression = Boolean(item.isRegression && item.status === 'exposed');

    if (!isOverdue && !isRegression) continue;

    const broker = findBrokerById(item.brokerId);
    const daysOverdue = isOverdue ? Math.max(1, Math.abs(sla.daysRemaining)) : 0;
    const isIntentionalOrRepeat =
      isRegression || (item.escalationCount || 0) > 0 || daysOverdue >= 15;

    const deleteActDailyFineUsd = daysOverdue * 200;
    const conservativePenaltyUsd =
      (isIntentionalOrRepeat ? maxPerViolation : basePerViolation) +
      (normalizedState === 'CA' ? deleteActDailyFineUsd : 0);
    const maximumPenaltyUsd = maxPerViolation + deleteActDailyFineUsd;

    const basisParts: string[] = [];
    if (isOverdue) {
      basisParts.push(`${daysOverdue}d past 45-day statutory SLA`);
    }
    if (isRegression) {
      basisParts.push('Unlawful re-listing after prior opt-out');
    }
    if ((item.escalationCount || 0) > 0) {
      basisParts.push(`Ignored ${item.escalationCount} cure notice(s)`);
    }

    lineItems.push({
      brokerId: item.brokerId,
      brokerName: broker?.name || item.brokerId,
      brokerDomain: broker?.domain || `${item.brokerId}.com`,
      daysOverdue,
      isIntentionalOrRepeat,
      violationBasis: basisParts.join(' · '),
      conservativePenaltyUsd,
      maximumPenaltyUsd,
      deleteActDailyFineUsd,
    });
  }

  const overdueCount = lineItems.filter((l) => l.daysOverdue > 0).length;
  const intentionalOrRepeatCount = lineItems.filter(
    (l) => l.isIntentionalOrRepeat
  ).length;
  const totalConservativeUsd = lineItems.reduce(
    (sum, l) => sum + l.conservativePenaltyUsd,
    0
  );
  const totalMaximumUsd = lineItems.reduce(
    (sum, l) => sum + l.maximumPenaltyUsd,
    0
  );
  const totalDeleteActAccruedUsd = lineItems.reduce(
    (sum, l) => sum + l.deleteActDailyFineUsd,
    0
  );

  return {
    applicableStatuteLabel,
    actionedCount,
    overdueCount,
    intentionalOrRepeatCount,
    totalConservativeUsd,
    totalMaximumUsd,
    totalDeleteActAccruedUsd,
    lineItems,
  };
}

export interface EvidenceRecordEntry {
  brokerId: string;
  brokerName: string;
  brokerDomain: string;
  privacyEmail: string;
  channel: 'VERIFIED_EMAIL_SMTP_OR_OAUTH' | 'MANUAL_PORTAL_SUBMISSION' | 'UNACTIONED_EXPOSURE';
  removalStatus: string;
  outboundMessageReceipt: string;
  brokerConfirmationTicket: string | null;
  submittedAtIso: string | null;
  verifiedRemovedAtIso: string | null;
  escalationCount: number;
  slaState: string;
  recordSha256: string;
}

export interface ChainOfCustodyManifest {
  schema: 'synOUT-chain-of-custody-v1';
  generatedAtIso: string;
  subjectName: string;
  jurisdiction: string;
  connectedSenderEmail: string;
  manifestSha256: string;
  damagesEstimate: StatutoryDamagesSummary;
  entries: EvidenceRecordEntry[];
}

export async function buildSignedChainOfCustodyManifest(
  profile: UserProfile,
  results: ScanResult[],
  senderEmail?: string,
  nowMs: number = Date.now()
): Promise<ChainOfCustodyManifest> {
  const generatedAtIso = new Date(nowMs).toISOString();
  const subjectName = `${profile.firstName} ${profile.lastName}`.trim();
  const jurisdiction = `${profile.currentCity}, ${profile.currentState}`.trim();
  const connectedSenderEmail =
    senderEmail || profile.emails[0] || 'unconnected-local-session';

  const relevant = results.filter(
    (r) =>
      r.status === 'exposed' ||
      r.removalStatus === 'submitted' ||
      r.removalStatus === 'removed'
  );

  const entries: EvidenceRecordEntry[] = [];
  for (const item of relevant) {
    const broker = findBrokerById(item.brokerId);
    const sla = computeBrokerSlaStatus(item, nowMs, 45);
    const channel: EvidenceRecordEntry['channel'] = hasVerifiedEmailReceipt(item)
      ? 'VERIFIED_EMAIL_SMTP_OR_OAUTH'
      : item.removalStatus === 'submitted' || item.removalStatus === 'removed'
      ? 'MANUAL_PORTAL_SUBMISSION'
      : 'UNACTIONED_EXPOSURE';

    const canonicalPayload = [
      item.brokerId,
      broker?.domain || '',
      item.removalStatus || 'found',
      item.optOutConfirmationCode || 'NONE',
      item.brokerConfirmationTicket || 'NONE',
      item.submittedAtIso || 'NONE',
      item.verifiedRemovedAtIso || 'NONE',
      String(item.escalationCount || 0),
    ].join('|');

    const recordSha256 = await sha256Hex(canonicalPayload);

    entries.push({
      brokerId: item.brokerId,
      brokerName: broker?.name || item.brokerId,
      brokerDomain: broker?.domain || `${item.brokerId}.com`,
      privacyEmail: broker?.privacyEmail || 'portal-only',
      channel,
      removalStatus: item.removalStatus || 'found',
      outboundMessageReceipt: item.optOutConfirmationCode || 'PENDING',
      brokerConfirmationTicket: item.brokerConfirmationTicket || null,
      submittedAtIso: item.submittedAtIso || null,
      verifiedRemovedAtIso: item.verifiedRemovedAtIso || null,
      escalationCount: item.escalationCount || 0,
      slaState: sla.state,
      recordSha256,
    });
  }

  const rootPayload = [
    subjectName,
    jurisdiction,
    connectedSenderEmail,
    ...entries.map((e) => e.recordSha256),
  ].join('\n');
  const manifestSha256 = await sha256Hex(rootPayload);
  const damagesEstimate = computeStatutoryDamagesEstimate(
    results,
    profile.currentState,
    nowMs
  );

  return {
    schema: 'synOUT-chain-of-custody-v1',
    generatedAtIso,
    subjectName,
    jurisdiction,
    connectedSenderEmail,
    manifestSha256,
    damagesEstimate,
    entries,
  };
}

export function formatChainOfCustodyMarkdown(
  manifest: ChainOfCustodyManifest
): string {
  const d = manifest.damagesEstimate;
  return `# synOUT Cryptographic Chain-of-Custody & Statutory Enforcement Manifest

- **Subject:** ${manifest.subjectName}
- **Jurisdiction:** ${manifest.jurisdiction}
- **Authenticated Sender:** \`${manifest.connectedSenderEmail}\`
- **Generated Timestamp (UTC):** \`${manifest.generatedAtIso}\`
- **Master Manifest SHA-256 Digest:** \`${manifest.manifestSha256}\`

---

## 1. Statutory Civil Penalty & Regulatory Exposure Summary

- **Governing Statutory Basis:** ${d.applicableStatuteLabel}
- **Actioned Broker Notices:** ${d.actionedCount}
- **Overdue Past 45-Day SLA:** ${d.overdueCount}
- **Intentional / Repeat Violations:** ${d.intentionalOrRepeatCount}
- **Estimated Civil Penalty Exposure:** $${d.totalConservativeUsd.toLocaleString()} – $${d.totalMaximumUsd.toLocaleString()} USD

${
  d.lineItems.length > 0
    ? `| Non-Compliant Broker | Domain | Violation Basis | Est. Civil Penalty Range |
| :--- | :--- | :--- | :--- |
${d.lineItems
  .map(
    (item) =>
      `| **${item.brokerName}** | \`${item.brokerDomain}\` | ${item.violationBasis} | $${item.conservativePenaltyUsd.toLocaleString()} – $${item.maximumPenaltyUsd.toLocaleString()} |`
  )
  .join('\n')}`
    : '_Zero overdue or repeat-regression violations currently accrued._'
}

---

## 2. Per-Broker Evidence Chain & SHA-256 Integrity Hashes

| Broker | Status | Channel | Outbound Receipt / Ticket | Record SHA-256 |
| :--- | :--- | :--- | :--- | :--- |
${manifest.entries
  .map(
    (e) =>
      `| **${e.brokerName}** (\`${e.brokerDomain}\`) | \`${e.removalStatus}\` (${e.slaState}) | ${e.channel} | \`${e.outboundMessageReceipt}\`${e.brokerConfirmationTicket ? ` / Ticket \`${e.brokerConfirmationTicket}\`` : ''} | \`${e.recordSha256.slice(0, 16)}…\` |`
  )
  .join('\n')}

---
*Generated locally by synOUT Privacy Engine. Verify integrity by recomputing SHA-256 over canonical dispatch records.*
`;
}
