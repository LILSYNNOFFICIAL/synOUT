import crypto from 'node:crypto';
import { redactPiiForLogs } from '../urlSafety.ts';
import type { PostSubmitOutcomeKind, SubmissionEvidenceArtifact } from './types.ts';

/**
 * Generates a tamper-evident SubmissionEvidenceArtifact with SHA-256 DOM snapshot hashing,
 * PII-redacted response excerpt, and strict separation between synOUT's internalSubmissionId
 * and any genuine brokerConfirmationCode (`null` when the broker did not issue one).
 */
export function buildSubmissionEvidenceArtifact(params: {
  internalSubmissionId: string;
  brokerConfirmationCode: string | null;
  initialUrl: string;
  finalUrl: string;
  httpStatus: number;
  pageTitle: string;
  outcomeClassification: PostSubmitOutcomeKind;
  outcomeSummary: string;
  rawDomHtml: string;
  visibleText: string;
  fieldAudit: Array<{
    fieldKey: string;
    label: string;
    semanticRole: string;
    confidence: number;
    maskedValue: string;
    populated: boolean;
  }>;
}): SubmissionEvidenceArtifact {
  const submittedAtIso = new Date().toISOString();
  const domSnapshotSha256 = crypto
    .createHash('sha256')
    .update(params.rawDomHtml || '', 'utf8')
    .digest('hex');

  const redactedResponseExcerpt = redactPiiForLogs(
    (params.visibleText || '').replace(/\s+/g, ' ').trim()
  ).slice(0, 320);

  const canonicalPayload = JSON.stringify({
    internalSubmissionId: params.internalSubmissionId,
    brokerConfirmationCode: params.brokerConfirmationCode,
    submittedAtIso,
    initialUrl: params.initialUrl,
    finalUrl: params.finalUrl,
    httpStatus: params.httpStatus,
    outcomeClassification: params.outcomeClassification,
    domSnapshotSha256,
    fieldCount: params.fieldAudit.length,
  });

  const evidenceManifestSha256 = crypto
    .createHash('sha256')
    .update(canonicalPayload, 'utf8')
    .digest('hex');

  return {
    internalSubmissionId: params.internalSubmissionId,
    brokerConfirmationCode: params.brokerConfirmationCode,
    submittedAtIso,
    initialUrl: params.initialUrl,
    finalUrl: params.finalUrl,
    httpStatus: params.httpStatus,
    pageTitle: (params.pageTitle || '').slice(0, 160),
    outcomeClassification: params.outcomeClassification,
    outcomeSummary: params.outcomeSummary,
    domSnapshotSha256,
    evidenceManifestSha256,
    redactedResponseExcerpt,
    fieldAudit: params.fieldAudit,
  };
}
