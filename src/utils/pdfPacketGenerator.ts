import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { DataBroker, ScanResult, UserProfile } from '../types';
import { RegulatorComplaintPacket } from './stateRegistryEngine';
import {
  REGULATORY_AGENCIES,
  RegulatoryAgencyId,
  buildRegulatoryComplaintDossier,
  computeBrokerSlaStatus,
} from './statutorySlaEngine';
import { findBrokerById } from '../services/emailConnectionStore';
import { buildSignedChainOfCustodyManifest } from './evidenceDossierEngine';

/**
 * Sanitizes arbitrary strings into WinAnsi-safe ASCII/Latin-1 characters so pdf-lib
 * StandardFonts render cleanly without throwing encoding errors on Unicode glyphs.
 */
function toPdfSafeText(input: string): string {
  if (!input) return '';
  return input
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '--')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u00B7]/g, '-')
    .replace(/\u2192/g, '->')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA7\xA9\xAE\xB0]/g, '');
}

function wrapTextToLines(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const safe = toPdfSafeText(text);
  const rawParagraphs = safe.split(/\r?\n/);
  const lines: string[] = [];

  for (const para of rawParagraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        currentLine = candidate;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        // Hard-break ultra-long tokens (like 64-char SHA-256 hashes or URLs)
        if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (font.widthOfTextAtSize(chunk + ch, fontSize) > maxWidth) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          currentLine = chunk;
        } else {
          currentLine = word;
        }
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

interface PdfCursorContext {
  doc: PDFDocument;
  pages: PDFPage[];
  currentPage: PDFPage;
  y: number;
  fontRegular: PDFFont;
  fontBold: PDFFont;
  fontMono: PDFFont;
  marginX: number;
  pageWidth: number;
  pageHeight: number;
  headerSubtitle: string;
}

function addFormattedPage(ctx: PdfCursorContext): PDFPage {
  const page = ctx.doc.addPage([ctx.pageWidth, ctx.pageHeight]);
  ctx.pages.push(page);
  ctx.currentPage = page;

  // Top executive bar
  page.drawRectangle({
    x: 0,
    y: ctx.pageHeight - 44,
    width: ctx.pageWidth,
    height: 44,
    color: rgb(0.03, 0.06, 0.14),
  });
  page.drawText('synOUT STATUTORY PRIVACY & REGULATORY ENFORCEMENT DOSSIER', {
    x: ctx.marginX,
    y: ctx.pageHeight - 24,
    size: 9,
    font: ctx.fontBold,
    color: rgb(0.08, 0.85, 0.62),
  });
  page.drawText(toPdfSafeText(ctx.headerSubtitle).slice(0, 88), {
    x: ctx.marginX,
    y: ctx.pageHeight - 36,
    size: 7.5,
    font: ctx.fontMono,
    color: rgb(0.72, 0.78, 0.86),
  });

  ctx.y = ctx.pageHeight - 66;
  return page;
}

function ensureSpace(ctx: PdfCursorContext, neededHeight: number): void {
  if (ctx.y - neededHeight < 54) {
    addFormattedPage(ctx);
  }
}

function drawSectionHeading(ctx: PdfCursorContext, title: string): void {
  ensureSpace(ctx, 28);
  ctx.currentPage.drawRectangle({
    x: ctx.marginX,
    y: ctx.y - 16,
    width: ctx.pageWidth - ctx.marginX * 2,
    height: 20,
    color: rgb(0.93, 0.96, 0.99),
  });
  ctx.currentPage.drawText(toPdfSafeText(title), {
    x: ctx.marginX + 8,
    y: ctx.y - 10,
    size: 9.5,
    font: ctx.fontBold,
    color: rgb(0.05, 0.11, 0.22),
  });
  ctx.y -= 28;
}

function drawParagraphBlock(
  ctx: PdfCursorContext,
  text: string,
  opts?: { font?: PDFFont; size?: number; lineHeight?: number; color?: [number, number, number] }
): void {
  const font = opts?.font || ctx.fontRegular;
  const size = opts?.size || 8.5;
  const lineHeight = opts?.lineHeight || 12;
  const [cr, cg, cb] = opts?.color || [0.12, 0.16, 0.23];
  const maxWidth = ctx.pageWidth - ctx.marginX * 2;
  const lines = wrapTextToLines(text, font, size, maxWidth);

  for (const line of lines) {
    ensureSpace(ctx, lineHeight + 2);
    if (line.length > 0) {
      ctx.currentPage.drawText(line, {
        x: ctx.marginX,
        y: ctx.y,
        size,
        font,
        color: rgb(cr, cg, cb),
      });
    }
    ctx.y -= lineHeight;
  }
}

function drawPoaAttestationBox(ctx: PdfCursorContext, profile: UserProfile): void {
  const poa = profile.powerOfAttorney;
  if (!poa || !poa.isSigned) return;

  ensureSpace(ctx, 84);
  const boxHeight = 72;
  const boxWidth = ctx.pageWidth - ctx.marginX * 2;

  ctx.currentPage.drawRectangle({
    x: ctx.marginX,
    y: ctx.y - boxHeight,
    width: boxWidth,
    height: boxHeight,
    color: rgb(0.94, 0.99, 0.96),
    borderColor: rgb(0.1, 0.65, 0.45),
    borderWidth: 1,
  });

  ctx.currentPage.drawText(
    'SIGNED AUTHORIZED AGENT DESIGNATION (CCPA § 1798.130 / 11 CCR § 7063)',
    {
      x: ctx.marginX + 10,
      y: ctx.y - 15,
      size: 8.5,
      font: ctx.fontBold,
      color: rgb(0.04, 0.38, 0.26),
    }
  );
  ctx.currentPage.drawText(
    toPdfSafeText(
      `Principal Signature: /s/ ${poa.fullName}   |   Auth Code: ${poa.authCode}   |   Signed: ${poa.signedDate}`
    ),
    {
      x: ctx.marginX + 10,
      y: ctx.y - 29,
      size: 8,
      font: ctx.fontMono,
      color: rgb(0.08, 0.18, 0.14),
    }
  );
  ctx.currentPage.drawText(
    toPdfSafeText(`Designated Representative: ${poa.agentName} (${poa.address})`),
    {
      x: ctx.marginX + 10,
      y: ctx.y - 42,
      size: 8,
      font: ctx.fontRegular,
      color: rgb(0.14, 0.22, 0.18),
    }
  );
  ctx.currentPage.drawText(
    toPdfSafeText(poa.scopeOfAuthority).slice(0, 118),
    {
      x: ctx.marginX + 10,
      y: ctx.y - 56,
      size: 7.5,
      font: ctx.fontRegular,
      color: rgb(0.24, 0.32, 0.28),
    }
  );

  ctx.y -= boxHeight + 14;
}

function stampPageFooters(ctx: PdfCursorContext, manifestHash: string): void {
  const total = ctx.pages.length;
  ctx.pages.forEach((page, index) => {
    page.drawLine({
      start: { x: ctx.marginX, y: 38 },
      end: { x: ctx.pageWidth - ctx.marginX, y: 38 },
      thickness: 0.5,
      color: rgb(0.8, 0.84, 0.89),
    });
    page.drawText(
      toPdfSafeText(`SHA-256 Chain-of-Custody Seal: ${manifestHash.slice(0, 40)}...`),
      {
        x: ctx.marginX,
        y: 24,
        size: 7,
        font: ctx.fontMono,
        color: rgb(0.38, 0.44, 0.52),
      }
    );
    const pageLabel = `Page ${index + 1} of ${total}`;
    const labelWidth = ctx.fontBold.widthOfTextAtSize(pageLabel, 7.5);
    page.drawText(pageLabel, {
      x: ctx.pageWidth - ctx.marginX - labelWidth,
      y: 24,
      size: 7.5,
      font: ctx.fontBold,
      color: rgb(0.25, 0.32, 0.42),
    });
  });
}

async function createCursorContext(headerSubtitle: string): Promise<PdfCursorContext> {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await doc.embedFont(StandardFonts.Courier);

  const ctx: PdfCursorContext = {
    doc,
    pages: [],
    currentPage: null as unknown as PDFPage,
    y: 0,
    fontRegular,
    fontBold,
    fontMono,
    marginX: 44,
    pageWidth: 612, // US Letter 8.5 x 11 in
    pageHeight: 792,
    headerSubtitle,
  };
  addFormattedPage(ctx);
  return ctx;
}

export async function generateRegulatorComplaintPdf(
  packet: RegulatorComplaintPacket,
  profile: UserProfile
): Promise<Uint8Array> {
  const ctx = await createCursorContext(
    `${packet.packetId} | Target Agency: ${packet.agency.shortLabel} | Generated: ${packet.generatedAtIso}`
  );
  ctx.doc.setTitle(`${packet.packetId} - ${packet.agency.shortLabel} Regulatory Complaint`);
  ctx.doc.setAuthor(`${profile.firstName} ${profile.lastName}`.trim() || 'synOUT Consumer');
  ctx.doc.setSubject(packet.agency.statuteCitation);

  drawSectionHeading(ctx, '1. REGULATORY FILING SUMMARY & JURISDICTIONAL AUTHORITY');
  drawParagraphBlock(
    ctx,
    [
      `Packet Reference ID: ${packet.packetId}`,
      `Receiving Enforcement Agency: ${packet.agency.name}`,
      `Statutory Citation: ${packet.agency.statuteCitation}`,
      `Official Filing Portal: ${packet.agency.filingPortalUrl}`,
      `Maximum Statutory Penalty: ${packet.agency.maxStatutoryPenalty}`,
      `Complainant: ${profile.firstName} ${profile.lastName} (${profile.currentCity}, ${profile.currentState})`,
      `Chain-of-Custody SHA-256: ${packet.manifest.manifestSha256}`,
    ].join('\n'),
    { size: 8.5, lineHeight: 13 }
  );

  ctx.y -= 6;
  drawPoaAttestationBox(ctx, profile);

  drawSectionHeading(
    ctx,
    `2. RESPONDENT DATA BROKER AUDIT LEDGER (${packet.targetBrokers.length} ENTITIES)`
  );
  for (let i = 0; i < packet.targetBrokers.length; i++) {
    const b = packet.targetBrokers[i];
    drawParagraphBlock(
      ctx,
      `${i + 1}. ${b.brokerName} (${b.brokerDomain}) | Registry: ${b.cppaRegistrationCode}\n` +
        `   Submitted: ${b.submittedAtIso ? b.submittedAtIso.slice(0, 10) : 'Unrecorded'} | Elapsed: ${b.daysElapsed}d | SLA Status: ${b.slaState.toUpperCase()}\n` +
        `   Outbound Receipt: ${b.outboundReceipt}${b.brokerTicket ? ` | Ticket: ${b.brokerTicket}` : ''}`,
      { font: ctx.fontMono, size: 7.8, lineHeight: 11 }
    );
    ctx.y -= 4;
  }

  ctx.y -= 6;
  drawSectionHeading(ctx, '3. FORMAL STATUTORY COMPLAINT & PRAYER FOR ENFORCEMENT');
  drawParagraphBlock(ctx, packet.formalComplaintText, {
    font: ctx.fontRegular,
    size: 8.5,
    lineHeight: 12,
  });

  stampPageFooters(ctx, packet.manifest.manifestSha256);
  return ctx.doc.save();
}

export async function generateBrokerEscalationPdf(params: {
  agencyId: RegulatoryAgencyId;
  broker: DataBroker;
  result: ScanResult;
  profile: UserProfile;
  senderEmail: string;
}): Promise<Uint8Array> {
  const { agencyId, broker, result, profile, senderEmail } = params;
  const agency =
    REGULATORY_AGENCIES.find((a) => a.id === agencyId) || REGULATORY_AGENCIES[0];
  const sla = computeBrokerSlaStatus(result);
  const manifest = await buildSignedChainOfCustodyManifest(profile, [result], senderEmail);
  const complaintText = buildRegulatoryComplaintDossier(
    agencyId,
    broker,
    result,
    profile,
    senderEmail
  );

  const ctx = await createCursorContext(
    `Single-Respondent Enforcement Dossier | ${broker.name} (${broker.domain}) | ${agency.name}`
  );
  ctx.doc.setTitle(`synOUT Regulatory Escalation - ${broker.name}`);
  ctx.doc.setAuthor(`${profile.firstName} ${profile.lastName}`.trim() || 'synOUT Consumer');

  drawSectionHeading(ctx, '1. CASE METADATA & 45-DAY STATUTORY SLA AUDIT');
  drawParagraphBlock(
    ctx,
    [
      `Respondent Data Broker: ${broker.name} (${broker.domain})`,
      `Target Enforcement Agency: ${agency.name}`,
      `Complainant: ${profile.firstName} ${profile.lastName} (${profile.currentCity}, ${profile.currentState})`,
      `Verified Consumer Email: ${senderEmail}`,
      `Initial Demand Submitted: ${result.submittedAtIso || result.submissionDate || 'Pending'}`,
      `SLA Countdown Status: ${sla.state.toUpperCase()} (${sla.daysElapsed} days elapsed / ${sla.daysRemaining} days remaining)`,
      `Outbound Email / Portal Receipt: ${result.optOutConfirmationCode || result.webFormConfirmationCode || 'N/A'}`,
      `Playwright Submission SHA-256: ${result.submissionEvidenceHash || 'N/A'}`,
      `Manifest SHA-256 Seal: ${manifest.manifestSha256}`,
    ].join('\n'),
    { size: 8.5, lineHeight: 13 }
  );

  ctx.y -= 6;
  drawPoaAttestationBox(ctx, profile);

  drawSectionHeading(ctx, '2. FORMAL AGENCY COMPLAINT & STATUTORY ESCALATION RECORD');
  drawParagraphBlock(ctx, complaintText, {
    font: ctx.fontMono,
    size: 8,
    lineHeight: 11.5,
  });

  stampPageFooters(ctx, manifest.manifestSha256);
  return ctx.doc.save();
}

export async function generateMasterComplianceAuditPdf(params: {
  results: ScanResult[];
  profile: UserProfile;
  senderEmail?: string;
}): Promise<Uint8Array> {
  const { results, profile, senderEmail } = params;
  const manifest = await buildSignedChainOfCustodyManifest(
    profile,
    results,
    senderEmail || profile.emails[0]
  );
  const tracked = results.filter(
    (r) => r.status === 'exposed' || r.removalStatus === 'submitted' || r.removalStatus === 'removed'
  );
  const removedCount = results.filter((r) => r.removalStatus === 'removed').length;
  const submittedCount = results.filter((r) => r.removalStatus === 'submitted').length;

  const ctx = await createCursorContext(
    `Master 45-Day SLA & Chain-of-Custody Audit | Subject: ${profile.firstName} ${profile.lastName}`
  );
  ctx.doc.setTitle(`synOUT Master Compliance & SLA Audit - ${profile.lastName}`);
  ctx.doc.setAuthor(`${profile.firstName} ${profile.lastName}`.trim() || 'synOUT Consumer');

  drawSectionHeading(ctx, '1. EXECUTIVE PRIVACY SUPPRESSION & SLA SUMMARY');
  drawParagraphBlock(
    ctx,
    [
      `Audit Timestamp: ${new Date().toISOString()}`,
      `Consumer Subject: ${profile.firstName} ${profile.lastName} (${profile.currentCity}, ${profile.currentState})`,
      `Total Tracked Clearinghouses: ${tracked.length}`,
      `Active Statutory Demands in 45-Day SLA Window: ${submittedCount}`,
      `Confirmed Expunged / Suppressed Profiles: ${removedCount}`,
      `Cryptographic Manifest Seal (SHA-256): ${manifest.manifestSha256}`,
    ].join('\n'),
    { size: 8.5, lineHeight: 13 }
  );

  ctx.y -= 6;
  drawPoaAttestationBox(ctx, profile);

  drawSectionHeading(ctx, '2. ITEMIZED BROKER RECEIPTS & STATUTORY SLA COUNTDOWNS');
  if (tracked.length === 0) {
    drawParagraphBlock(ctx, 'No exposed or actioned broker records are currently present in this workspace.');
  } else {
    tracked.forEach((item, idx) => {
      const broker = findBrokerById(item.brokerId);
      const sla = computeBrokerSlaStatus(item);
      const receipt =
        item.brokerConfirmationTicket ||
        item.optOutConfirmationCode ||
        item.webFormConfirmationCode ||
        'Awaiting Dispatch';
      drawParagraphBlock(
        ctx,
        `${idx + 1}. ${broker?.name || item.brokerId} (${broker?.domain || item.brokerId}) — [${item.removalStatus.toUpperCase()}]\n` +
          `   SLA State: ${sla.state} (${sla.daysElapsed}d elapsed) | Receipt: ${receipt}`,
        { font: ctx.fontMono, size: 7.8, lineHeight: 11 }
      );
      ctx.y -= 3;
    });
  }

  stampPageFooters(ctx, manifest.manifestSha256);
  return ctx.doc.save();
}

export function downloadPdfBytes(pdfBytes: Uint8Array, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
