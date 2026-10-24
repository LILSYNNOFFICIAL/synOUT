import {
  CanaryAliasRecord,
  PublicRecordChecklistState,
  UserProfile,
} from '../types';

const CANARY_STORAGE_KEY = 'synout_canary_aliases_v1';
const PUBLIC_RECORDS_STORAGE_KEY = 'synout_public_records_progress_v1';

export interface UpstreamPublicRecordGuide {
  id: string;
  title: string;
  category:
    | 'Property & Assessor Deeds'
    | 'Voter Registration & ACP'
    | 'Motor Vehicle & DPPA'
    | 'Corporate, UCC & WHOIS'
    | 'Postal & Change-of-Address';
  riskSummary: string;
  statutoryCitations: string;
  defaultRecipientPlaceholder: string;
  officialDirectoryUrl: string;
  officialDirectoryLabel: string;
  checklistSteps: string[];
}

export const UPSTREAM_PUBLIC_RECORD_GUIDES: UpstreamPublicRecordGuide[] = [
  {
    id: 'county_assessor_deed',
    title: 'County Assessor & Recorder Property Parcel Web Redaction',
    category: 'Property & Assessor Deeds',
    riskSummary:
      'County tax assessor and recorder portals are scraped weekly by people-search syndicates (Whitepages, Spokeo, NeighborWho, CoreLogic) to link your legal name to your residential street address and mortgage history.',
    statutoryCitations:
      'State Public Record Web-Display Redaction Statutes (incl. Cal. Gov. Code § 7928.205, Fla. Stat. § 119.071, Tex. Tax Code § 25.025, & County Assessor Public Portal Privacy Policies)',
    defaultRecipientPlaceholder: 'assessor@county.gov',
    officialDirectoryUrl: 'https://www.nacocounties.org/',
    officialDirectoryLabel: 'National Association of Counties Lookup',
    checklistSteps: [
      'Locate your County Tax Assessor / County Recorder public parcel search portal and note your Assessor Parcel Number (APN).',
      'Send the customized Owner Name Web-Index Redaction Petition below to the County Assessor / Recorder Public Records Officer.',
      'For future property acquisitions or refinancing, consider holding residential title in a non-eponymous revocable living trust.',
    ],
  },
  {
    id: 'state_voter_roll',
    title: 'State Voter Registration Commercial Roll Suppression & Safe at Home (ACP)',
    category: 'Voter Registration & ACP',
    riskSummary:
      'In over 30 states, statewide voter registration files (containing full name, home street address, birth date, and phone number) can be purchased in bulk and are ingested by commercial people-lookup sites.',
    statutoryCitations:
      'State Confidential Voter & Address Confidentiality Program (ACP) Statutes (e.g., Cal. Elec. Code § 2166 / § 2166.5, Tex.Code Crim. Proc. Ch. 58, Wash. RCW 40.24, N.Y. Exec. Law § 108)',
    defaultRecipientPlaceholder: 'elections@sos.state.gov',
    officialDirectoryUrl: 'https://www.nass.org/can-I-vote',
    officialDirectoryLabel: 'NASS State Election Office Directory',
    checklistSteps: [
      'Check your state Secretary of State / County Registrar voter privacy options and Address Confidentiality Program (ACP / Safe at Home) eligibility.',
      'Submit the Voter File Public/Commercial Suppression Request to your County Registrar of Voters.',
      'Ensure phone number and email fields on your voter registration record are marked optional/omitted upon renewal.',
    ],
  },
  {
    id: 'state_dmv_dppa',
    title: "State DMV Driver's Privacy Protection Act (DPPA) Bulk Resale Block",
    category: 'Motor Vehicle & DPPA',
    riskSummary:
      'Vehicle registration, VIN, and license address records feed skip-tracing clearinghouses when bulk commercial or survey disclosures are not explicitly restricted.',
    statutoryCitations:
      "Federal Driver's Privacy Protection Act (18 U.S.C. § 2721–2725) & State Motor Vehicle Record Privacy Acts",
    defaultRecipientPlaceholder: 'privacy@dmv.state.gov',
    officialDirectoryUrl: 'https://www.usa.gov/state-motor-vehicle-services',
    officialDirectoryLabel: 'Official US State DMV Directory',
    checklistSteps: [
      'Open your State DMV portal and verify your DPPA privacy election blocks commercial, marketing, and bulk list disclosures.',
      'Transmit or mail the formal 18 U.S.C. § 2721 DPPA Non-Disclosure Notice to your state motor vehicle records division.',
      'Remove dealership license-plate frames and opt out of connected-vehicle telematics data sharing (LexisNexis Telematics / Verisk).',
    ],
  },
  {
    id: 'whois_domain_registry',
    title: 'ICANN Domain WHOIS / RDAP Registrant PII Redaction',
    category: 'Corporate, UCC & WHOIS',
    riskSummary:
      'Historical and unredacted domain registrations expose personal home addresses, phone numbers, and personal emails in permanent WHOIS/RDAP archives.',
    statutoryCitations:
      'ICANN Registration Data Policy, CCPA Cal. Civ. Code § 1798.105 & GDPR Art. 17',
    defaultRecipientPlaceholder: 'privacy@registrar.example',
    officialDirectoryUrl: 'https://lookup.icann.org/',
    officialDirectoryLabel: 'ICANN Official RDAP Lookup',
    checklistSteps: [
      'Inspect your registered domains on ICANN RDAP Lookup to confirm registrant name, street, phone, and email show REDACTED FOR PRIVACY.',
      'Enable free WHOIS Privacy Proxy on every registrar account and dispatch the Historical WHOIS Archive Deletion Notice below.',
    ],
  },
  {
    id: 'secretary_of_state_ucc',
    title: 'Secretary of State LLC / Sole-Proprietor & UCC Filing Address Shield',
    category: 'Corporate, UCC & WHOIS',
    riskSummary:
      'State business entity registries, solar/equipment UCC-1 financing statements, and PPP/SBA archives are scraped into B2B & executive brokers (ZoomInfo, Apollo, RocketReach, OpenCorporates).',
    statutoryCitations:
      'State Commercial Registered Agent Statutes & CCPA/CPRA B2B Contact Protections',
    defaultRecipientPlaceholder: 'corps@sos.state.gov',
    officialDirectoryUrl: 'https://www.nass.org/business-services/corporate-registration',
    officialDirectoryLabel: 'State Corporate Registry Portals',
    checklistSteps: [
      'Replace any home residential street address on LLC/corporate filings with a Commercial Registered Agent address.',
      'Send the Statutory Principal/Debtor Residential Address Redaction Request to downstream corporate registry mirrors.',
    ],
  },
  {
    id: 'usps_ncoa_hygiene',
    title: 'USPS NCOA Move-Feed & Commercial Mail Receiving (PMB) Isolation',
    category: 'Postal & Change-of-Address',
    riskSummary:
      'Filing a standard residential USPS Change-of-Address (COA) updates the National Change of Address (NCOA) licensing feed, broadcasting your new home address to direct-mail brokers within 30 days.',
    statutoryCitations:
      '39 U.S.C. § 412 (Postal Mailing List Non-Disclosure) & DMAchoice / NCOA Suppression',
    defaultRecipientPlaceholder: 'privacy@usps.gov',
    officialDirectoryUrl: 'https://www.usps.com/manage/po-boxes.htm',
    officialDirectoryLabel: 'USPS PO Box & Addressing Portal',
    checklistSteps: [
      'Establish a USPS P.O. Box or Private Mailbox (PMB) for all commercial deliveries, loyalty accounts, magazine subscriptions, and warranties.',
      'When relocating, notify banks, insurers, and employers directly instead of relying on commercial NCOA address-forwarding chains.',
    ],
  },
];

export interface PublicRecordLetterContext {
  agencyName?: string;
  recipientEmail?: string;
  parcelOrVoterId?: string;
  countyName?: string;
  senderEmail?: string;
}

export function buildPublicRecordSuppressionLetter(
  guideId: string,
  profile: UserProfile,
  context: PublicRecordLetterContext = {}
): { subject: string; body: string } {
  const guide =
    UPSTREAM_PUBLIC_RECORD_GUIDES.find((g) => g.id === guideId) ||
    UPSTREAM_PUBLIC_RECORD_GUIDES[0];

  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const email =
    context.senderEmail || profile.emails[0] || 'consumer@example.com';
  const agency =
    context.agencyName?.trim() ||
    `${profile.currentCity} / ${profile.currentState} Public Records Custodian`;
  const countyLine = context.countyName?.trim()
    ? `- County / Recording District: ${context.countyName.trim()}\n`
    : '';
  const idLine = context.parcelOrVoterId?.trim()
    ? `- Parcel APN / Registration / Filing Identifier: ${context.parcelOrVoterId.trim()}\n`
    : '';

  const subject = `PUBLIC RECORD PRIVACY REQUEST: ${guide.title} - ${profile.firstName} ${profile.lastName}`;

  const body = `DATE: ${dateStr}
TO: Custodian of Records / Privacy Officer, ${agency}
FROM: ${profile.firstName} ${profile.lastName} <${email}>
RE: FORMAL REQUEST FOR PUBLIC WEB-INDEX REDACTION & BULK COMMERCIAL RESALE RESTRICTION
STATUTORY AUTHORITY: ${guide.statutoryCitations}

Dear Custodian of Public Records / Privacy Compliance Officer,

I am writing as a resident of ${profile.currentCity}, ${profile.currentState} to formally request privacy suppression, online search-index redaction, and exclusion from bulk commercial third-party licensing feeds for records associated with my personal residence and identity.

RECORD & SUBJECT IDENTIFICATION:
- Full Legal Name: ${profile.firstName} ${profile.lastName}
- Residential Jurisdiction: ${profile.currentCity}, ${profile.currentState} ${profile.currentZip || ''}
${countyLine}${idLine}- Contact Phone: ${profile.phoneNumbers[0] || 'On file'}
- Contact Email: ${email}

REQUESTED PRIVACY & SAFETY ACTIONS:
1. Suppress or redact my residential street address, telephone number, and personal email from public-facing internet search portals and bulk third-party commercial data extracts to the fullest extent permitted by ${profile.currentState} and federal law (${guide.statutoryCitations}).
2. Record my explicit election to OPT OUT of any non-mandatory commercial list licensing, marketing distribution, or bulk data broker syndication feeds.
3. Confirm in writing to ${email} once this restriction has been applied or advise if a specific county/state affidavit form is required.

Thank you for your prompt attention to protecting resident privacy against commercial data harvesting.

Sincerely,
${profile.firstName} ${profile.lastName}`;

  return { subject, body };
}

function cleanSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 14) || 'vendor';
}

function computeDeterministicTag(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 4);
}

export interface GenerateCanaryInput {
  baseEmail?: string;
  customDomain?: string;
  vendorName: string;
  vendorDomain?: string;
  vendorPrivacyEmail?: string;
  compartmentPhone?: string;
  category?: CanaryAliasRecord['category'];
  deterministicSeed?: string;
}

export function generateCanaryAliasRecord(
  input: GenerateCanaryInput
): CanaryAliasRecord {
  const vendorSlug = cleanSlug(input.vendorName);
  const seed =
    input.deterministicSeed ||
    `${input.vendorName}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const tagToken = `${vendorSlug}-${computeDeterministicTag(seed)}`;

  let aliasEmail = '';
  const cleanCustomDomain = (input.customDomain || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');

  if (cleanCustomDomain && cleanCustomDomain.includes('.')) {
    aliasEmail = `${tagToken}@${cleanCustomDomain}`;
  } else {
    const rawBase = (input.baseEmail || 'consumer@gmail.com').trim().toLowerCase();
    const atIdx = rawBase.indexOf('@');
    if (atIdx > 0) {
      const localPart = rawBase.slice(0, atIdx).split('+')[0];
      const domainPart = rawBase.slice(atIdx + 1);
      aliasEmail = `${localPart}+${tagToken}@${domainPart}`;
    } else {
      aliasEmail = `privacy+${tagToken}@example.com`;
    }
  }

  const normalizedDomain = (
    input.vendorDomain ||
    `${vendorSlug}.com`
  )
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');

  return {
    id: `canary-${Date.now()}-${computeDeterministicTag(seed)}`,
    vendorName: input.vendorName.trim(),
    vendorDomain: normalizedDomain,
    vendorPrivacyEmail:
      input.vendorPrivacyEmail?.trim() || `privacy@${normalizedDomain}`,
    aliasEmail,
    compartmentPhone: input.compartmentPhone?.trim() || undefined,
    tagToken,
    category: input.category || 'Retail & Loyalty',
    status: 'active',
    createdAtIso: new Date().toISOString(),
  };
}

export interface LeakAttributionResult {
  matched: boolean;
  extractedEmails: string[];
  matchedRecord: CanaryAliasRecord | null;
  inferredVendorTag: string | null;
  explanation: string;
}

export function attributeLeakFromRawEmail(
  rawHeaderOrEmailText: string,
  savedAliases: CanaryAliasRecord[]
): LeakAttributionResult {
  const text = rawHeaderOrEmailText || '';
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex) || [];
  const extractedEmails = Array.from(
    new Set(matches.map((e) => e.toLowerCase()))
  );

  // 1. Direct match against tracked CanaryAliasRecords
  for (const addr of extractedEmails) {
    const exact = savedAliases.find(
      (rec) =>
        rec.aliasEmail.toLowerCase() === addr ||
        addr.includes(rec.tagToken.toLowerCase())
    );
    if (exact) {
      return {
        matched: true,
        extractedEmails,
        matchedRecord: exact,
        inferredVendorTag: exact.tagToken,
        explanation: `Forensic Canary Match: Incoming message was addressed to "${addr}", which was uniquely issued exclusively to ${exact.vendorName} (${exact.vendorDomain}). This proves ${exact.vendorName} or one of its sub-processors disclosed, leaked, or sold your contact record.`,
      };
    }
  }

  // 2. Heuristic subaddress (+tag) extraction even if alias wasn't pre-registered
  for (const addr of extractedEmails) {
    const plusMatch = addr.match(/^[^+@]+\+([^@]+)@/);
    if (plusMatch && plusMatch[1]) {
      return {
        matched: true,
        extractedEmails,
        matchedRecord: null,
        inferredVendorTag: plusMatch[1],
        explanation: `Plus-Tag Canary Detected: Message was delivered to subaddress tag "+${plusMatch[1]}" (${addr}), identifying "${plusMatch[1]}" as the original collection point.`,
      };
    }
  }

  return {
    matched: false,
    extractedEmails,
    matchedRecord: null,
    inferredVendorTag: null,
    explanation:
      extractedEmails.length > 0
        ? `Inspected ${extractedEmails.length} email address(es) (${extractedEmails.join(', ')}), but none matched a tracked canary alias or +subaddress tag.`
        : 'No email addresses found in the pasted headers or message text.',
  };
}

export function buildVendorLeakAuditDemand(
  record: CanaryAliasRecord,
  profile: UserProfile,
  senderEmail?: string
): { subject: string; body: string } {
  const fromEmail = senderEmail || profile.emails[0] || record.aliasEmail;
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const subject = `STATUTORY AUDIT & DELETION DEMAND (CCPA § 1798.115 / Unauthorized Disclosure of Unique Canary ${record.aliasEmail})`;

  const body = `DATE: ${dateStr}
TO: Chief Privacy Officer & Legal Compliance, ${record.vendorName} (${record.vendorPrivacyEmail || `privacy@${record.vendorDomain}`})
FROM: ${profile.firstName} ${profile.lastName} <${fromEmail}>
RE: FORENSIC DETECTION OF THIRD-PARTY DISCLOSURE & STATUTORY RIGHT-TO-KNOW / DELETION DEMAND

To Whom It May Concern,

On ${new Date(record.createdAtIso).toLocaleDateString('en-US')}, I provided a cryptographically unique, single-purpose contact identifier—specifically "${record.aliasEmail}"—exclusively to ${record.vendorName} (${record.vendorDomain}). That identifier has never been shared with any other entity.

Third-party commercial/unsolicited communications have now been received at "${record.aliasEmail}", establishing verifiable forensic proof that personal information held by ${record.vendorName} was sold, shared, syndicated, or exposed to external third parties.

PURSUANT TO CAL. CIV. CODE §§ 1798.105, 1798.115, 1798.120 & APPLICABLE STATE PRIVACY LAWS, I DEMAND:
1. DISCLOSURE OF THIRD-PARTY RECIPIENTS (§ 1798.115): Provide the specific categories and identities of all third parties, data brokers, ad-tech exchanges, or affiliates to whom ${record.vendorName} sold, shared, or disclosed personal data associated with "${record.aliasEmail}" in the preceding 12 months.
2. IMMEDIATE OPT-OUT OF SALE & SHARING (§ 1798.120): Cease all sale, sharing, or commercial licensing of my personal information immediately.
3. COMPLETE EXPUNGEMENT & CASCADING DELETION (§ 1798.105): Permanently delete all records associated with ${profile.firstName} ${profile.lastName} and "${record.aliasEmail}", and instruct all downstream recipients and service providers to purge my records.

Please transmit your written statutory disclosure and deletion confirmation to ${fromEmail} within 45 calendar days.

Sincerely,
${profile.firstName} ${profile.lastName}
Jurisdiction: ${profile.currentCity}, ${profile.currentState}`;

  return { subject, body };
}

export function loadCanaryAliases(): CanaryAliasRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CANARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCanaryAliases(records: CanaryAliasRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CANARY_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

export function clearCanaryAliases(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CANARY_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function loadPublicRecordProgress(): Record<string, PublicRecordChecklistState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PUBLIC_RECORDS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function savePublicRecordProgress(
  progress: Record<string, PublicRecordChecklistState>
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      PUBLIC_RECORDS_STORAGE_KEY,
      JSON.stringify(progress)
    );
  } catch {
    // Ignore storage errors
  }
}

export function clearPublicRecordProgress(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PUBLIC_RECORDS_STORAGE_KEY);
  } catch {
    // Ignore
  }
}
