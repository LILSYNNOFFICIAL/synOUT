import { DATA_BROKERS } from '../data/brokers';
import { getExhaustiveBrokerRegistry } from './dynamicBrokerRegistry';
import { getBrokerRecordSearchUrl } from './scanEngine';
import {
  DataBroker,
  ScanHistorySnapshot,
  ScanResult,
  ScanStats,
  UserProfile,
} from '../types';

/**
 * Defends against CSV Formula Injection (CWE-1236)
 * If a field starts with =, +, -, @, or tab/return, prepend a single quote so spreadsheet
 * tools (Excel, Sheets, LibreOffice) treat it strictly as text.
 */
export function sanitizeCsvCell(cell: unknown): string {
  if (cell === null || cell === undefined) return '""';
  let str = String(cell).trim();

  // Guard against CSV formula execution characters
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Escape quotes and wrap in quotes
  return `"${str.replace(/"/g, '""')}"`;
}

export interface FullScanResultExportRow {
  resultId: string;
  brokerId: string;
  brokerName: string;
  domain: string;
  category: string;
  riskLevel: string;
  scanStatus: ScanResult['status'];
  removalStatus: string;
  matchConfidence: string;
  removalMethod: string;
  estimatedRemovalWindow: string;
  exposedRecordsCount: number;
  leakedDataPoints: string[];
  evidenceBasis: string;
  disqualifiedReason: string | null;
  crossStateEvidence: string | null;
  recordSearchUrl: string;
  officialOptOutUrl: string;
  privacyEmail: string;
  verificationSource: string;
  liveProbeStatus: string;
  liveProbeCheckedAtIso: string | null;
  optOutConfirmationCode: string | null;
  brokerConfirmationTicket: string | null;
  submissionDate: string | null;
  submittedAtIso: string | null;
  webFormSubmittedAtIso: string | null;
  verifiedRemovedAtIso: string | null;
  workflowState: string | null;
  submissionEvidenceHash: string | null;
  isRegression: boolean;
}

export interface FullScanDocumentationPayload {
  schema: 'synOUT-external-scan-documentation-v1';
  exportedAtIso: string;
  subjectSummary: {
    fullName: string;
    primaryJurisdiction: string;
    previousLocationsCount: number;
    phonesOnFileCount: number;
    emailsOnFileCount: number;
    powerOfAttorneySigned: boolean;
  };
  summaryStats: ScanStats;
  historicalExposureTrend: Array<{
    id: string;
    timestampIso: string;
    exposureScore: number;
    exposedBrokersCount: number;
    submittedBrokersCount: number;
    removedBrokersCount: number;
  }>;
  scanResults: FullScanResultExportRow[];
}

function triggerBlobDownload(content: string, mimeType: string, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildSafeSlug(value: string): string {
  return (value || 'subject')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'subject';
}

export function buildFullScanExportRows(
  profile: UserProfile,
  results: ScanResult[]
): FullScanResultExportRow[] {
  const registry = getExhaustiveBrokerRegistry();
  const brokerMap = new Map<string, DataBroker>();
  for (const b of DATA_BROKERS) {
    brokerMap.set(b.id, b);
  }
  for (const b of registry) {
    brokerMap.set(b.id, b);
  }

  return results.map((item) => {
    const broker = brokerMap.get(item.brokerId);
    const domain = broker?.domain || `${item.brokerId}.com`;
    const recordSearchUrl = broker
      ? getBrokerRecordSearchUrl(broker, profile)
      : item.mockListingData.profiles?.[0] || `https://${domain}`;

    const leakedDataPoints =
      item.status === 'exposed'
        ? item.mockListingData.leakTypes?.length > 0
          ? item.mockListingData.leakTypes
          : broker?.dataExposedList || []
        : [];

    return {
      resultId: item.id,
      brokerId: item.brokerId,
      brokerName: broker?.name || item.brokerId,
      domain,
      category: broker?.category || 'Data Broker',
      riskLevel: broker?.risk || item.mockListingData.riskLevel || 'Medium',
      scanStatus: item.status,
      removalStatus:
        item.removalStatus || (item.status === 'clean' ? 'not_applicable_clean' : 'found'),
      matchConfidence: item.mockListingData.matchConfidence || 'NO_RECORD',
      removalMethod: broker?.removalMethod || 'Online Form',
      estimatedRemovalWindow: broker?.removalTime || 'Up to 45 days',
      exposedRecordsCount:
        item.status === 'exposed' ? item.mockListingData.recordsCount || 1 : 0,
      leakedDataPoints,
      evidenceBasis: item.mockListingData.evidenceBasis || '',
      disqualifiedReason: item.disqualifiedReason || null,
      crossStateEvidence: item.mockListingData.crossStateEvidence || null,
      recordSearchUrl,
      officialOptOutUrl: item.submittedOptOutUrl || broker?.optOutUrl || `https://${domain}`,
      privacyEmail: broker?.privacyEmail || '',
      verificationSource: item.verificationSource || 'heuristic_exposure_estimate',
      liveProbeStatus: item.liveProbeStatus || 'unprobed',
      liveProbeCheckedAtIso: item.liveProbeCheckedAtIso || null,
      optOutConfirmationCode: item.optOutConfirmationCode || null,
      brokerConfirmationTicket:
        item.brokerConfirmedReceipt || item.brokerConfirmationTicket || null,
      submissionDate: item.submissionDate || null,
      submittedAtIso: item.submittedAtIso || null,
      webFormSubmittedAtIso: item.webFormSubmittedAtIso || null,
      verifiedRemovedAtIso: item.verifiedRemovedAtIso || null,
      workflowState: item.workflowState || null,
      submissionEvidenceHash: item.submissionEvidenceHash || null,
      isRegression: Boolean(item.isRegression),
    };
  });
}

/**
 * Generates a complete CWE-1236-hardened CSV containing EVERY scanned broker
 * (both exposed and clean/disqualified records) for external audit documentation.
 */
export function generateFullScanResultsCsv(
  profile: UserProfile,
  results: ScanResult[]
): string {
  const headers = [
    'Result ID',
    'Broker ID',
    'Broker Name',
    'Domain',
    'Category',
    'Risk Level',
    'Scan Status',
    'Removal Status',
    'Match Confidence',
    'Removal Methodology',
    'Estimated Removal Window',
    'Exposed Records Count',
    'Leaked Data Points',
    'Evidence Basis',
    'Disqualified Reason',
    'Cross-State Attribution',
    'Record Search URL',
    'Official Opt-Out URL',
    'Privacy Officer Contact',
    'Verification Source',
    'Live Probe Status',
    'Confirmation Reference',
    'Broker Ticket ID',
    'Submission Date',
    'Submitted Timestamp (ISO)',
    'Web Form Submitted (ISO)',
    'Verified Removed (ISO)',
    'Workflow State',
    'Evidence Manifest SHA-256',
    'Re-Listing Regression',
  ];

  const rows = buildFullScanExportRows(profile, results).map((row) =>
    [
      sanitizeCsvCell(row.resultId),
      sanitizeCsvCell(row.brokerId),
      sanitizeCsvCell(row.brokerName),
      sanitizeCsvCell(row.domain),
      sanitizeCsvCell(row.category),
      sanitizeCsvCell(row.riskLevel),
      sanitizeCsvCell(row.scanStatus),
      sanitizeCsvCell(row.removalStatus),
      sanitizeCsvCell(row.matchConfidence),
      sanitizeCsvCell(row.removalMethod),
      sanitizeCsvCell(row.estimatedRemovalWindow),
      sanitizeCsvCell(row.exposedRecordsCount),
      sanitizeCsvCell(row.leakedDataPoints.join('; ')),
      sanitizeCsvCell(row.evidenceBasis),
      sanitizeCsvCell(row.disqualifiedReason || ''),
      sanitizeCsvCell(row.crossStateEvidence || ''),
      sanitizeCsvCell(row.recordSearchUrl),
      sanitizeCsvCell(row.officialOptOutUrl),
      sanitizeCsvCell(row.privacyEmail),
      sanitizeCsvCell(row.verificationSource),
      sanitizeCsvCell(row.liveProbeStatus),
      sanitizeCsvCell(row.optOutConfirmationCode || 'Not Actioned'),
      sanitizeCsvCell(row.brokerConfirmationTicket || ''),
      sanitizeCsvCell(row.submissionDate || ''),
      sanitizeCsvCell(row.submittedAtIso || ''),
      sanitizeCsvCell(row.webFormSubmittedAtIso || ''),
      sanitizeCsvCell(row.verifiedRemovedAtIso || ''),
      sanitizeCsvCell(row.workflowState || ''),
      sanitizeCsvCell(row.submissionEvidenceHash || ''),
      sanitizeCsvCell(row.isRegression ? 'YES' : 'NO'),
    ].join(',')
  );

  return [headers.map(sanitizeCsvCell).join(','), ...rows].join('\r\n');
}

/**
 * Generates a structured JSON dossier containing EVERY scanned broker
 * (both exposed and clean), summary metrics, and historical exposure score snapshots.
 */
export function generateFullScanResultsJson(
  profile: UserProfile,
  results: ScanResult[],
  stats: ScanStats,
  snapshots: ScanHistorySnapshot[] = []
): string {
  const sortedSnapshots = [...snapshots].sort(
    (a, b) => Date.parse(a.timestampIso) - Date.parse(b.timestampIso)
  );

  const payload: FullScanDocumentationPayload = {
    schema: 'synOUT-external-scan-documentation-v1',
    exportedAtIso: new Date().toISOString(),
    subjectSummary: {
      fullName: `${profile.firstName} ${profile.lastName}`.trim(),
      primaryJurisdiction: `${profile.currentCity}, ${profile.currentState}`.trim(),
      previousLocationsCount: Array.isArray(profile.previousLocations)
        ? profile.previousLocations.filter(Boolean).length
        : 0,
      phonesOnFileCount: Array.isArray(profile.phoneNumbers)
        ? profile.phoneNumbers.filter(Boolean).length
        : 0,
      emailsOnFileCount: Array.isArray(profile.emails)
        ? profile.emails.filter(Boolean).length
        : 0,
      powerOfAttorneySigned: Boolean(profile.powerOfAttorney?.isSigned),
    },
    summaryStats: stats,
    historicalExposureTrend: sortedSnapshots.map((snap) => ({
      id: snap.id,
      timestampIso: snap.timestampIso,
      exposureScore: snap.exposureScore,
      exposedBrokersCount: snap.exposedBrokerIds.length,
      submittedBrokersCount: snap.submittedBrokerIds.length,
      removedBrokersCount: snap.removedBrokerIds.length,
    })),
    scanResults: buildFullScanExportRows(profile, results),
  };

  return JSON.stringify(payload, null, 2);
}

export function exportFullScanResultsCsv(
  profile: UserProfile,
  results: ScanResult[]
): void {
  const csvContent = generateFullScanResultsCsv(profile, results);
  const slug = `${buildSafeSlug(profile.lastName)}-${buildSafeSlug(profile.firstName)}`;
  triggerBlobDownload(
    csvContent,
    'text/csv;charset=utf-8;',
    `synout-full-scan-results-${slug}.csv`
  );
}

export function exportFullScanResultsJson(
  profile: UserProfile,
  results: ScanResult[],
  stats: ScanStats,
  snapshots: ScanHistorySnapshot[] = []
): void {
  const jsonContent = generateFullScanResultsJson(profile, results, stats, snapshots);
  const slug = `${buildSafeSlug(profile.lastName)}-${buildSafeSlug(profile.firstName)}`;
  triggerBlobDownload(
    jsonContent,
    'application/json;charset=utf-8;',
    `synout-full-scan-results-${slug}.json`
  );
}

export function exportExposureReportCsv(
  profile: UserProfile,
  results: ScanResult[]
): void {
  const exposed = results.filter((r) => r.status === 'exposed');

  const headers = [
    'Broker Name',
    'Domain',
    'Category',
    'Removal Methodology',
    'Risk Level',
    'Removal Status',
    'Confirmation Reference',
    'Submission Date',
    'Estimated Removal Speed',
    'Exposed Records Count',
    'Leaked Data Points',
    'Official Opt-Out URL',
    'Privacy Officer Contact',
  ];

  const registry = getExhaustiveBrokerRegistry();
  const rows = exposed.map((item) => {
    const broker =
      registry.find((b) => b.id === item.brokerId) ||
      DATA_BROKERS.find((b) => b.id === item.brokerId);
    return [
      sanitizeCsvCell(broker?.name || item.brokerId),
      sanitizeCsvCell(broker?.domain || ''),
      sanitizeCsvCell(broker?.category || ''),
      sanitizeCsvCell(broker?.removalMethod || ''),
      sanitizeCsvCell(broker?.risk || ''),
      sanitizeCsvCell(item.removalStatus),
      sanitizeCsvCell(item.optOutConfirmationCode || 'Not Actioned'),
      sanitizeCsvCell(item.submissionDate || 'N/A'),
      sanitizeCsvCell(broker?.removalTime || ''),
      sanitizeCsvCell(item.mockListingData.recordsCount),
      sanitizeCsvCell(broker?.dataExposedList.join('; ') || ''),
      sanitizeCsvCell(broker?.optOutUrl || ''),
      sanitizeCsvCell(broker?.privacyEmail || ''),
    ].join(',');
  });

  const csvContent = [headers.map(sanitizeCsvCell).join(','), ...rows].join('\r\n');
  const slug = `${buildSafeSlug(profile.lastName)}-${buildSafeSlug(profile.firstName)}`;
  triggerBlobDownload(
    csvContent,
    'text/csv;charset=utf-8;',
    `synout-audit-${slug}.csv`
  );
}

