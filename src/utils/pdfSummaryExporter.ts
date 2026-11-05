import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import {
  ScanHistorySnapshot,
  ScanResult,
  ScanStats,
  UserProfile,
} from '../types';
import {
  findBrokerById,
  hasVerifiedEmailReceipt,
} from '../services/emailConnectionStore';
import { hasWebFormSubmission } from './optOutFormEngine';
import { normalizeStateCode } from './scanEngine';

export interface PdfCategoryBreakdownRow {
  category: string;
  exposedCount: number;
  cleanCount: number;
  inProgressOrRemovedCount: number;
}

export interface PdfExposedBrokerRow {
  brokerId: string;
  brokerName: string;
  domain: string;
  category: string;
  risk: 'Critical' | 'High' | 'Medium';
  recordsCount: number;
  exposedDataSummary: string;
  channelAndSla: string;
  statusLabel: string;
  receiptSummary: string;
}

export interface PdfHistoricalPointSummary {
  dateLabel: string;
  score: number;
  exposedCount: number;
  removedCount: number;
}

export interface PdfSummaryDocumentData {
  referenceId: string;
  generatedDateLabel: string;
  generatedIso: string;
  subjectFullName: string;
  jurisdictionLabel: string;
  addressSummary: string;
  contactSummary: string;
  exposureScore: number;
  baselineScore: number;
  scoreDelta: number;
  totalScanned: number;
  exposedBrokers: number;
  criticalBrokers: number;
  highRiskBrokers: number;
  inProgressRemovals: number;
  removedBrokers: number;
  categoryBreakdown: PdfCategoryBreakdownRow[];
  historicalPoints: PdfHistoricalPointSummary[];
  brokerRows: PdfExposedBrokerRow[];
}

const UNSUPPORTED_CSS_FN_REGEX = /\b(?:color-mix|oklch|oklab|lch|lab|color)\s*\(/gi;

/**
 * Replaces CSS Color Level 4/5 functions (oklch, oklab, color-mix, lch, lab, color)
 * with html2canvas-safe hex/rgba colors using balanced parenthesis scanning so nested
 * expressions like color-mix(in oklab, oklch(...) 50%, transparent) remain valid CSS.
 */
export function sanitizeClonedStylesheetsForHtml2Canvas(cssText: string): string {
  if (!cssText) return '';

  let result = '';
  let cursor = 0;

  while (cursor < cssText.length) {
    UNSUPPORTED_CSS_FN_REGEX.lastIndex = cursor;
    const match = UNSUPPORTED_CSS_FN_REGEX.exec(cssText);
    if (!match) {
      result += cssText.slice(cursor);
      break;
    }

    const fnStart = match.index;
    result += cssText.slice(cursor, fnStart);

    const openParenIdx = fnStart + match[0].length - 1;
    let depth = 1;
    let i = openParenIdx + 1;
    while (i < cssText.length && depth > 0) {
      const ch = cssText[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      i += 1;
    }

    const fnNameLower = match[0].toLowerCase();
    const safeReplacement = fnNameLower.startsWith('color-mix')
      ? 'rgba(51, 65, 85, 0.22)'
      : '#334155';

    result += safeReplacement;
    cursor = i;
  }

  return result;
}

/**
 * Builds structured, deterministic printer-friendly summary data from the user's
 * current exposure dossier, category distribution, and historical snapshots.
 */
export function buildPdfSummaryDocumentData(
  profile: UserProfile,
  results: ScanResult[],
  stats: ScanStats,
  snapshots: ScanHistorySnapshot[] = []
): PdfSummaryDocumentData {
  const now = new Date();
  const generatedIso = now.toISOString();
  const generatedDateLabel = now.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const stateCode = normalizeStateCode(profile.currentState) || profile.currentState;
  const subjectFullName = `${profile.firstName} ${profile.lastName}`.trim() || 'Protected Consumer';
  const jurisdictionLabel = `${profile.currentCity}, ${stateCode}`;
  const addressSummary = [
    profile.currentStreet?.trim(),
    `${profile.currentCity}, ${stateCode}`,
    profile.currentZip?.trim(),
  ]
    .filter(Boolean)
    .join(' · ');

  const validPhones = (profile.phoneNumbers || []).filter((p) => Boolean(p && p.trim()));
  const validEmails = (profile.emails || []).filter((e) => Boolean(e && e.trim()));
  const contactSummary = [
    validEmails[0] || 'No email listed',
    validPhones[0] || 'No phone listed',
    profile.birthYear ? `Born ${profile.birthYear}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const sortedSnaps = [...snapshots].sort(
    (a, b) => new Date(a.timestampIso).getTime() - new Date(b.timestampIso).getTime()
  );

  const baselineScore =
    sortedSnaps.length > 0 ? sortedSnaps[0].exposureScore : stats.exposureScore;
  const scoreDelta = stats.exposureScore - baselineScore;

  const historicalPoints: PdfHistoricalPointSummary[] = sortedSnaps.slice(-6).map((snap) => ({
    dateLabel: new Date(snap.timestampIso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    score: snap.exposureScore,
    exposedCount: snap.exposedBrokerIds.length,
    removedCount: snap.removedBrokerIds.length,
  }));

  // Category aggregation
  const catMap = new Map<string, PdfCategoryBreakdownRow>();
  for (const r of results) {
    const broker = findBrokerById(r.brokerId);
    const category = broker?.category || 'People Search';
    const existing = catMap.get(category) || {
      category,
      exposedCount: 0,
      cleanCount: 0,
      inProgressOrRemovedCount: 0,
    };

    if (r.status === 'exposed') {
      existing.exposedCount += 1;
    } else {
      existing.cleanCount += 1;
    }

    if (r.removalStatus === 'submitted' || r.removalStatus === 'removed') {
      existing.inProgressOrRemovedCount += 1;
    }

    catMap.set(category, existing);
  }

  const categoryBreakdown = Array.from(catMap.values()).sort(
    (a, b) => b.exposedCount - a.exposedCount || b.cleanCount - a.cleanCount
  );

  // Exposed broker rows sorted Critical -> High -> Medium -> Name
  const riskRank: Record<string, number> = { Critical: 3, High: 2, Medium: 1 };
  const brokerRows: PdfExposedBrokerRow[] = results
    .filter((r) => r.status === 'exposed')
    .map((r) => {
      const broker = findBrokerById(r.brokerId);
      const emailSent = hasVerifiedEmailReceipt(r);
      const formSent = hasWebFormSubmission(r);

      let statusLabel = 'Action Pending';
      if (r.removalStatus === 'removed') {
        statusLabel = 'Verified Removed';
      } else if (emailSent && formSent) {
        statusLabel = 'Form + Email Sent';
      } else if (emailSent) {
        statusLabel = 'Legal Email Sent';
      } else if (formSent) {
        statusLabel = 'Web Form Submitted';
      } else if (r.removalStatus === 'submitted') {
        statusLabel = 'Submitted';
      }

      const receipt =
        r.brokerConfirmationTicket ||
        r.webFormConfirmationCode ||
        r.optOutConfirmationCode ||
        '—';

      return {
        brokerId: r.brokerId,
        brokerName: broker?.name || r.brokerId,
        domain: broker?.domain || '—',
        category: broker?.category || 'People Search',
        risk: broker?.risk || r.mockListingData.riskLevel || 'Medium',
        recordsCount: r.mockListingData.recordsCount || 1,
        exposedDataSummary: (broker?.dataExposedList || r.mockListingData.leakTypes || [])
          .slice(0, 3)
          .join(', '),
        channelAndSla: `${broker?.removalMethod || 'Online Form'} (${broker?.removalTime || '45d'})`,
        statusLabel,
        receiptSummary: receipt.length > 26 ? `${receipt.slice(0, 24)}…` : receipt,
      };
    })
    .sort(
      (a, b) =>
        (riskRank[b.risk] || 0) - (riskRank[a.risk] || 0) ||
        a.brokerName.localeCompare(b.brokerName)
    );

  const dateCompact = generatedIso.slice(0, 10).replace(/-/g, '');
  const referenceId = `SYNOUT-${stateCode || 'US'}-${dateCompact}-${results.length}`;

  return {
    referenceId,
    generatedDateLabel,
    generatedIso,
    subjectFullName,
    jurisdictionLabel,
    addressSummary,
    contactSummary,
    exposureScore: stats.exposureScore,
    baselineScore,
    scoreDelta,
    totalScanned: results.length,
    exposedBrokers: stats.exposedBrokers,
    criticalBrokers: stats.criticalBrokers,
    highRiskBrokers: stats.highRiskBrokers,
    inProgressRemovals: stats.inProgressRemovals,
    removedBrokers: stats.removedBrokers,
    categoryBreakdown,
    historicalPoints,
    brokerRows,
  };
}

/**
 * Renders the printer-friendly DOM summary element with html2canvas and paginates
 * it cleanly into a downloadable US Letter PDF via jsPDF.
 */
export async function downloadExposurePdfSummary({
  element,
  profile,
  stats,
}: {
  element: HTMLElement;
  profile: UserProfile;
  stats: ScanStats;
}): Promise<string> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: 860,
    onclone: (clonedDoc) => {
      // Remove external font/css link stylesheets if they cause cross-origin or oklch issues
      const styleTags = Array.from(clonedDoc.querySelectorAll('style'));
      for (const styleEl of styleTags) {
        if (styleEl.textContent) {
          styleEl.textContent = sanitizeClonedStylesheetsForHtml2Canvas(styleEl.textContent);
        }
      }

      const clonedTarget = clonedDoc.getElementById(element.id);
      if (clonedTarget) {
        clonedTarget.classList.add('pdf-offscreen-stage--capturing');
      }
    },
  });

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  });

  const pageWidthPt = pdf.internal.pageSize.getWidth(); // 612pt
  const pageHeightPt = pdf.internal.pageSize.getHeight(); // 792pt
  const marginX = 28;
  const marginTop = 28;
  const footerReserve = 30;
  const printableWidthPt = pageWidthPt - marginX * 2;
  const printableHeightPt = pageHeightPt - marginTop - footerReserve;

  const pxPerPt = canvas.width / printableWidthPt;
  const sliceHeightPx = Math.max(1, Math.floor(printableHeightPt * pxPerPt));
  const totalPages = Math.max(1, Math.ceil(canvas.height / sliceHeightPx));
  const dateStamp = new Date().toISOString().slice(0, 10);

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    if (pageIndex > 0) {
      pdf.addPage('letter', 'portrait');
    }

    const sourceY = pageIndex * sliceHeightPx;
    const currentSlicePx = Math.min(sliceHeightPx, canvas.height - sourceY);
    const currentSlicePt = currentSlicePx / pxPerPt;

    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = currentSlicePx;

    const ctx = sliceCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0,
        sourceY,
        canvas.width,
        currentSlicePx,
        0,
        0,
        canvas.width,
        currentSlicePx
      );
    }

    const sliceDataUrl = sliceCanvas.toDataURL('image/png', 1.0);
    pdf.addImage(
      sliceDataUrl,
      'PNG',
      marginX,
      marginTop,
      printableWidthPt,
      currentSlicePt,
      undefined,
      'FAST'
    );

    // Crisp vector page footer
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(
      `synOUT Exposure Status Summary · ${profile.firstName} ${profile.lastName} · Score ${stats.exposureScore}/100`,
      marginX,
      pageHeightPt - 14
    );
    pdf.text(
      `Generated ${dateStamp} · Page ${pageIndex + 1} of ${totalPages}`,
      pageWidthPt - marginX,
      pageHeightPt - 14,
      { align: 'right' }
    );
  }

  const safeLastName =
    (profile.lastName || 'Consumer').replace(/[^a-zA-Z0-9_-]/g, '') || 'Consumer';
  const filename = `synOUT-Exposure-Summary-${safeLastName}-${dateStamp}.pdf`;
  pdf.save(filename);
  return filename;
}
