import { DATA_BROKERS } from '../data/brokers';
import { getExhaustiveBrokerRegistry } from './dynamicBrokerRegistry';
import { ScanResult, UserProfile } from '../types';

/**
 * Defends against CSV Formula Injection (CWE-1236)
 * If a field starts with =, +, -, @, or tab/return, prepend a single quote so spreadsheet
 * tools (Excel, Sheets, LibreOffice) treat it strictly as text.
 */
function sanitizeCsvCell(cell: unknown): string {
  if (cell === null || cell === undefined) return '""';
  let str = String(cell).trim();

  // Guard against CSV formula execution characters
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Escape quotes and wrap in quotes
  return `"${str.replace(/"/g, '""')}"`;
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
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    `synout-audit-${profile.lastName.toLowerCase()}-${profile.firstName.toLowerCase()}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
