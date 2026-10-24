import { ScanResult, ScanStats, UserProfile } from '../types';
import { DATA_BROKERS } from '../data/brokers';
import { getExhaustiveBrokerRegistry } from './dynamicBrokerRegistry';
import { getBrokerRecordSearchUrl } from './scanEngine';

function lookupBroker(brokerId: string) {
  return (
    getExhaustiveBrokerRegistry().find((b) => b.id === brokerId) ||
    DATA_BROKERS.find((b) => b.id === brokerId)
  );
}

function getBrokerDetails(result: ScanResult) {
  const broker = lookupBroker(result.brokerId);
  return {
    name: broker?.name || result.brokerId,
    domain: broker?.domain || `${result.brokerId}.com`,
    category: broker?.category || 'Data Broker',
    risk: broker?.risk || result.mockListingData.riskLevel,
    optOutUrl: broker?.optOutUrl || `https://${result.brokerId}.com/optout`,
    privacyEmail: broker?.privacyEmail || `privacy@${result.brokerId}.com`,
    status: result.status,
    removalStatus: result.removalStatus,
    matchConfidence: result.mockListingData.matchConfidence,
    evidenceBasis: result.mockListingData.evidenceBasis,
    leakTypes: result.mockListingData.leakTypes.join(', '),
  };
}

export function generateMarkdownReport(results: ScanResult[], stats: ScanStats, profile: UserProfile): string {
  const exposed = results.filter((r) => r.status === 'exposed');
  const dateStr = new Date().toISOString().split('T')[0];

  return `# synOUT Exposure & Autonomous Removal Dossier
**Generated On:** ${dateStr}  
**Subject:** ${profile.firstName} ${profile.lastName}  
**Primary Jurisdiction:** ${profile.currentCity}, ${profile.currentState}  
**Risk Score:** ${stats.exposureScore}/100 (${stats.criticalBrokers} Critical, ${stats.highRiskBrokers} High Risk)  
**Total Brokers Scanned:** ${results.length} | **Exposed Profiles:** ${stats.exposedBrokers} | **Suppression Active:** ${stats.removedBrokers}

---

## 1. Executive Summary

synOUT scanned ${results.length} known data broker platforms, consumer intelligence clearinghouses, and public record indexes for records matching **${profile.firstName} ${profile.lastName}**.

- **Exposed Brokers Found:** ${stats.exposedBrokers}
- **Critical Risk Listings:** ${stats.criticalBrokers}
- **Estimated Records Exposed:** ${stats.totalRecordsExposed}
- **Autonomous Removals Submitted:** ${stats.inProgressRemovals}
- **Verified Scrubbed:** ${stats.removedBrokers}

---

## 2. Exposed Listings Dossier

| Broker Name | Domain | Category | Risk | Leaked Attributes | Match Confidence | Removal Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${exposed
  .map((r) => {
    const b = getBrokerDetails(r);
    return `| **${b.name}** | \`${b.domain}\` | ${b.category} | **${b.risk}** | ${b.leakTypes} | ${b.matchConfidence} | \`${b.removalStatus}\` |`;
  })
  .join('\n')}

---

## 3. Evidence & Direct Inspection Links

${exposed
  .map((r, idx) => {
    const b = getBrokerDetails(r);
    const searchUrl = getBrokerRecordSearchUrl(
      lookupBroker(r.brokerId) || {
        id: r.brokerId,
        name: b.name,
        domain: b.domain,
        category: b.category as any,
        risk: b.risk as any,
        optOutUrl: b.optOutUrl,
        recordsUrl: `https://${b.domain}`,
        privacyEmail: b.privacyEmail,
        removalMethod: 'Online Form',
        removalTime: '7-14 Days',
        dataExposedList: [],
        overview: '',
        instructions: [],
        exposureLikelihood: 0.5,
      },
      profile
    );

    return `### ${idx + 1}. ${b.name} (\`${b.domain}\`)
- **Category:** ${b.category} | **Risk Level:** ${b.risk}
- **Evidence Basis:** ${b.evidenceBasis}
- **Exposed PII:** ${b.leakTypes}
- **Direct Record Search Query:** [Inspect Public Record](${searchUrl})
- **Official Opt-Out Endpoint:** [Submit Deletion](${b.optOutUrl})
- **Statutory Contact:** \`${b.privacyEmail}\`
- **Suppression State:** \`${b.removalStatus}\`
`;
  })
  .join('\n')}

---
*synOUT Autonomous Privacy System - Zero PII Retained Client-Side - End of Report*
`;
}

export function generatePlainTextReport(results: ScanResult[], stats: ScanStats, profile: UserProfile): string {
  const exposed = results.filter((r) => r.status === 'exposed');
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const separator = '='.repeat(80);
  const subSeparator = '-'.repeat(80);

  return `${separator}
synOUT - AUTONOMOUS DATA BROKER & EXPOSURE AUDIT REPORT
${separator}
Generated: ${dateStr}
Target:    ${profile.firstName} ${profile.lastName}
Location:  ${profile.currentCity}, ${profile.currentState}
Score:     ${stats.exposureScore}/100 (Exposed: ${stats.exposedBrokers} | Clean: ${stats.cleanBrokers})
${separator}

1. SUMMARY OF EXPOSURE
${subSeparator}
Total Databases Audited:      ${results.length}
Confirmed Exposed Entities:    ${stats.exposedBrokers}
Critical Severity Listings:    ${stats.criticalBrokers}
High Severity Listings:        ${stats.highRiskBrokers}
Total Records Distributed:     ${stats.totalRecordsExposed}
Removals in Progress:          ${stats.inProgressRemovals}
Verified Expunged:             ${stats.removedBrokers}

2. DETAILED LISTING BREAKDOWN
${subSeparator}
${exposed
  .map((r, idx) => {
    const b = getBrokerDetails(r);
    return `[${idx + 1}] ENTITY: ${b.name.toUpperCase()} (${b.domain})
    Category:         ${b.category}
    Risk Level:       ${b.risk}
    Data Attributes:  ${b.leakTypes}
    Evidence Basis:   ${b.evidenceBasis}
    Removal Status:   ${b.removalStatus}
    Official Opt-Out: ${b.optOutUrl}
    Privacy Contact:  ${b.privacyEmail}
`;
  })
  .join('\n')}
${separator}
REPORT ID: synOUT-${Date.now()}
${separator}
`;
}

export function generateAsciiDocReport(results: ScanResult[], stats: ScanStats, profile: UserProfile): string {
  const exposed = results.filter((r) => r.status === 'exposed');
  const dateStr = new Date().toISOString().split('T')[0];

  return `= synOUT Exposure & Autonomous Removal Dossier
:author: synOUT Privacy Engine
:revdate: ${dateStr}
:toc: left
:icons: font

== Executive Summary

This document certifies the public data exposure findings for *${profile.firstName} ${profile.lastName}* across commercial data broker syndicates.

[cols="1,1,1,1", options="header"]
|===
| Metric | Value | Metric | Value
| Target Individual | ${profile.firstName} ${profile.lastName} | Primary Jurisdiction | ${profile.currentCity}, ${profile.currentState}
| Databases Scanned | ${results.length} | Exposed Entities | ${stats.exposedBrokers}
| Critical Exposure | ${stats.criticalBrokers} | High Risk Listings | ${stats.highRiskBrokers}
| Exposure Score | ${stats.exposureScore}/100 | Active Removals | ${stats.inProgressRemovals}
|===

== Exposed Broker Registries

[cols="2,2,2,1,2,1", options="header"]
|===
| Broker | Domain | Category | Risk | Leaked PII | Removal Status
${exposed
  .map((r) => {
    const b = getBrokerDetails(r);
    return `| ${b.name} | ${b.domain} | ${b.category} | *${b.risk}* | ${b.leakTypes} | \`${b.removalStatus}\``;
  })
  .join('\n')}
|===

== Direct Removal Endpoints

${exposed
  .map((r) => {
    const b = getBrokerDetails(r);
    return `=== ${b.name}
* *Domain:* \`${b.domain}\`
* *Opt-Out Portal:* link:${b.optOutUrl}[Official Opt-Out Page]
* *Statutory Contact:* mailto:${b.privacyEmail}[${b.privacyEmail}]
* *Evidence Basis:* ${b.evidenceBasis}
`;
  })
  .join('\n')}
`;
}

export function generateMeReport(results: ScanResult[], stats: ScanStats, profile: UserProfile): string {
  const exposed = results.filter((r) => r.status === 'exposed');
  const dateStr = new Date().toISOString().split('T')[0];

  return `.\\" synOUT Exposure & Autonomous Removal Dossier (.me macro format)
.he 'synOUT Exposure Report''%''
.fo 'CONFIDENTIAL & PRIVILEGED'synOUT Privacy Engine''
.tp
.sz 14
.b "synOUT EXPOSURE & AUTONOMOUS REMOVAL DOSSIER"
.sz 10
.sp 1
.sh 1 "EXECUTIVE SUMMARY"
.pp
This document certifies verified commercial exposure findings for the target individual under statutory privacy compliance mandates (CCPA / CPRA / GDPR).
.ip "Subject:" 18
${profile.firstName} ${profile.lastName}
.ip "Jurisdiction:" 18
${profile.currentCity}, ${profile.currentState}
.ip "Audit Date:" 18
${dateStr}
.ip "Risk Score:" 18
${stats.exposureScore}/100 (${stats.criticalBrokers} Critical, ${stats.highRiskBrokers} High)
.ip "Exposed Brokers:" 18
${stats.exposedBrokers} of ${results.length} Scanned
.ip "Records Exposed:" 18
${stats.totalRecordsExposed}
.ip "Removals Active:" 18
${stats.inProgressRemovals} Dispatched

.sp 1
.sh 1 "EXPOSED BROKER REGISTRIES"
${exposed
  .map((r, idx) => {
    const b = getBrokerDetails(r);
    return `.ip "[${idx + 1}]" 6
.b "${b.name}"
(\`${b.domain}\`) - Risk: ${b.risk} | Status: ${b.removalStatus}
.br
Leaked PII: ${b.leakTypes}
.br
Evidence Basis: ${b.evidenceBasis}
.br
Official Opt-Out: ${b.optOutUrl}
.br
Statutory Email: ${b.privacyEmail}`;
  })
  .join('\n')}

.sp 1
.sh 1 "STATUTORY ENFORCEMENT DIRECTIVE"
.pp
Pursuant to California Civil Code § 1798.100 and applicable consumer protection statutes, each listed data aggregator must permanently expunge and suppress records relating to the subject identity.
.sp 2
.\\" End of synOUT .me Dossier
`;
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand copy in sandboxed iframes
    }
  }

  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    } catch {
      return false;
    }
  }

  return false;
}

export function triggerPrintablePdf(results: ScanResult[], stats: ScanStats, profile: UserProfile) {
  if (typeof window === 'undefined') return;

  const exposed = results.filter((r) => r.status === 'exposed');
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const printHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>synOUT Dossier - ${profile.firstName} ${profile.lastName}</title>
  <style>
    @page { size: letter; margin: 18mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; line-height: 1.5; font-size: 11pt; margin: 0; padding: 20px; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
    .logo { font-size: 24pt; font-weight: 800; letter-spacing: -1px; color: #059669; }
    .title { font-size: 13pt; font-weight: 700; color: #1e293b; }
    .subtitle { font-size: 9pt; color: #64748b; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 24px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; }
    .card-label { font-size: 8pt; text-transform: uppercase; color: #64748b; font-weight: 600; }
    .card-value { font-size: 16pt; font-weight: 800; color: #0f172a; }
    .badge-critical { color: #dc2626; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 9pt; }
    th { background: #0f172a; color: #ffffff; text-align: left; padding: 8px 10px; font-size: 8pt; text-transform: uppercase; }
    td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    .risk-badge { font-size: 8pt; font-weight: bold; padding: 2px 6px; border-radius: 4px; display: inline-block; }
    .risk-Critical { background: #fee2e2; color: #991b1b; }
    .risk-High { background: #fef3c7; color: #92400e; }
    .risk-Medium { background: #e0f2fe; color: #075985; }
    .footer { margin-top: 30px; border-top: 1px solid #cbd5e1; padding-top: 10px; font-size: 8pt; color: #94a3b8; text-align: center; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">synOUT</div>
      <div class="title">Commercial Data Exposure & Statutory Deletion Dossier</div>
      <div class="subtitle">Audited Subject: <strong>${profile.firstName} ${profile.lastName}</strong> (${profile.currentCity}, ${profile.currentState})</div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 9pt; font-weight: 600;">Date: ${dateStr}</div>
      <div style="font-size: 8pt; color: #64748b;">Dossier ID: synOUT-${Date.now().toString(36).toUpperCase()}</div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="card">
      <div class="card-label">Exposed Entities</div>
      <div class="card-value">${stats.exposedBrokers}</div>
    </div>
    <div class="card">
      <div class="card-label">Critical Severity</div>
      <div class="card-value badge-critical">${stats.criticalBrokers}</div>
    </div>
    <div class="card">
      <div class="card-label">Estimated Records</div>
      <div class="card-value">${stats.totalRecordsExposed}</div>
    </div>
    <div class="card">
      <div class="card-label">Risk Rating</div>
      <div class="card-value">${stats.exposureScore}/100</div>
    </div>
  </div>

  <h3 style="font-size: 11pt; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Confirmed Exposed Broker Listings</h3>
  <table>
    <thead>
      <tr>
        <th style="width: 20%;">Broker Name</th>
        <th style="width: 20%;">Domain</th>
        <th style="width: 15%;">Severity</th>
        <th style="width: 30%;">Compromised PII</th>
        <th style="width: 15%;">Removal Status</th>
      </tr>
    </thead>
    <tbody>
      ${exposed
        .map((r) => {
          const b = getBrokerDetails(r);
          return `<tr>
            <td><strong>${b.name}</strong></td>
            <td><code style="font-family: monospace;">${b.domain}</code></td>
            <td><span class="risk-badge risk-${b.risk}">${b.risk}</span></td>
            <td>${b.leakTypes}</td>
            <td><strong>${b.removalStatus}</strong></td>
          </tr>`;
        })
        .join('')}
    </tbody>
  </table>

  <div class="footer">
    Generated autonomously by synOUT Personal Data Scrubbing Platform. Zero PII is retained on servers.
  </div>
</body>
</html>`;

  if (typeof document === 'undefined') return;
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const frameDoc = iframe.contentWindow?.document;
  if (frameDoc && iframe.contentWindow) {
    frameDoc.open();
    frameDoc.write(printHtml);
    frameDoc.close();
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        downloadFile(printHtml, `synOUT-Exposure-Report-${profile.lastName}.html`, 'text/html');
      } finally {
        setTimeout(() => {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        }, 2000);
      }
    }, 250);
  } else {
    downloadFile(printHtml, `synOUT-Exposure-Report-${profile.lastName}.html`, 'text/html');
  }
}
