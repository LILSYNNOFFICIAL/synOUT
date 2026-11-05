import { UserProfile } from '../types';

export type CreditFreezeStatus =
  | 'unfrozen'
  | 'freeze_requested'
  | 'frozen'
  | 'temporarily_thawed';

export type FraudAlertMode =
  | 'none'
  | 'initial_1yr'
  | 'extended_7yr'
  | 'active_duty_1yr';

export type FreezeRailCategory =
  | 'major_credit_bureau'
  | 'banking_telecom_specialty'
  | 'federal_identity_lock';

export type FreezeNoticeTemplateType =
  | 'fcra_security_freeze'
  | 'initial_fraud_alert_1yr'
  | 'extended_fraud_alert_7yr'
  | 'temporary_thaw_lift';

export interface CreditFreezeRailDefinition {
  id: string;
  name: string;
  category: FreezeRailCategory;
  categoryLabel: string;
  statutoryAuthority: string;
  portalUrl: string;
  phoneNumber: string;
  mailingAddress: string;
  complianceEmail?: string;
  protectsAgainst: string;
  freeByLaw: boolean;
  supportsFraudAlert: boolean;
  slaSummary: string;
}

export interface CreditFreezeRecord {
  railId: string;
  status: CreditFreezeStatus;
  fraudAlert: FraudAlertMode;
  referenceCode?: string;
  thawExpiresDate?: string;
  notes?: string;
  emailReceiptId?: string;
  updatedAtIso: string;
}

export type CreditFreezeStateMap = Record<string, CreditFreezeRecord>;

const CREDIT_FREEZE_STORAGE_KEY = 'synout_credit_freeze_state_v1';

export const CREDIT_FREEZE_RAILS: CreditFreezeRailDefinition[] = [
  {
    id: 'equifax',
    name: 'Equifax Information Services',
    category: 'major_credit_bureau',
    categoryLabel: 'Major Credit Bureau',
    statutoryAuthority: 'FCRA § 605A (15 U.S.C. § 1681c-1)',
    portalUrl: 'https://www.equifax.com/personal/credit-report-services/credit-freeze/',
    phoneNumber: '1-888-298-0045',
    mailingAddress: 'Equifax Security Freeze, P.O. Box 105788, Atlanta, GA 30348-5788',
    protectsAgainst: 'Unauthorized credit cards, auto loans, mortgages, and hard credit inquiries.',
    freeByLaw: true,
    supportsFraudAlert: true,
    slaSummary: '1 business day (online/phone) · 3 business days (mail)',
  },
  {
    id: 'experian',
    name: 'Experian Security Freeze Center',
    category: 'major_credit_bureau',
    categoryLabel: 'Major Credit Bureau',
    statutoryAuthority: 'FCRA § 605A (15 U.S.C. § 1681c-1)',
    portalUrl: 'https://www.experian.com/freeze/center.html',
    phoneNumber: '1-888-397-3742',
    mailingAddress: 'Experian Security Freeze, P.O. Box 9554, Allen, TX 75013',
    complianceEmail: 'privacy@experian.com',
    protectsAgainst: 'New revolving credit lines, personal loans, and synthetic identity credit pulls.',
    freeByLaw: true,
    supportsFraudAlert: true,
    slaSummary: '1 business day (online/phone) · 3 business days (mail)',
  },
  {
    id: 'transunion',
    name: 'TransUnion Credit Freeze',
    category: 'major_credit_bureau',
    categoryLabel: 'Major Credit Bureau',
    statutoryAuthority: 'FCRA § 605A (15 U.S.C. § 1681c-1)',
    portalUrl: 'https://www.transunion.com/credit-freeze',
    phoneNumber: '1-800-916-8800',
    mailingAddress: 'TransUnion, P.O. Box 160, Woodlyn, PA 19094',
    complianceEmail: 'privacy@transunion.com',
    protectsAgainst: 'FintechBNPL accounts, retail store credit cards, and tenant/credit screening pulls.',
    freeByLaw: true,
    supportsFraudAlert: true,
    slaSummary: '1 business day (online/phone) · 3 business days (mail)',
  },
  {
    id: 'innovis',
    name: 'Innovis Consumer Assistance (4th Bureau)',
    category: 'major_credit_bureau',
    categoryLabel: 'Major Credit Bureau',
    statutoryAuthority: 'FCRA § 605A (15 U.S.C. § 1681c-1)',
    portalUrl: 'https://www.innovis.com/personal/securityFreeze',
    phoneNumber: '1-866-712-4546',
    mailingAddress: 'Innovis Consumer Assistance, P.O. Box 530088, Atlanta, GA 30353-0088',
    protectsAgainst: 'Secondary mortgage verification, backup lender underwriting, and pre-screened credit lists.',
    freeByLaw: true,
    supportsFraudAlert: true,
    slaSummary: '1 business day (online/phone) · 3 business days (mail)',
  },
  {
    id: 'chexsystems',
    name: 'ChexSystems Deposit Account Freeze',
    category: 'banking_telecom_specialty',
    categoryLabel: 'Banking & Telecom Bureau',
    statutoryAuthority: 'FCRA § 605A & Nationwide Specialty CRA Rules',
    portalUrl: 'https://www.chexsystems.com/security-freeze/place-freeze',
    phoneNumber: '1-800-428-9623',
    mailingAddress: 'Chex Systems, Inc., Attn: Security Freeze, P.O. Box 583399, Minneapolis, MN 55458',
    complianceEmail: 'dpo@fisglobal.com',
    protectsAgainst: 'Fraudulent checking, savings, and neobank accounts opened in your name.',
    freeByLaw: true,
    supportsFraudAlert: true,
    slaSummary: 'Immediate online · 3 business days by mail',
  },
  {
    id: 'nctue',
    name: 'NCTUE (Telecom, Pay-TV & Utility Exchange)',
    category: 'banking_telecom_specialty',
    categoryLabel: 'Banking & Telecom Bureau',
    statutoryAuthority: 'FCRA § 605A Specialty Utility/Telecom Lock',
    portalUrl: 'https://nctue.com/consumers/',
    phoneNumber: '1-866-349-5355',
    mailingAddress: 'NCTUE Security Freeze, P.O. Box 105561, Atlanta, GA 30348',
    protectsAgainst: 'Unauthorized postpaid mobile carrier lines, SIM-swap account takeovers, and utility accounts.',
    freeByLaw: true,
    supportsFraudAlert: false,
    slaSummary: '1–3 business days upon verification',
  },
  {
    id: 'lexisnexis-freeze',
    name: 'LexisNexis Risk Solutions Security Freeze',
    category: 'banking_telecom_specialty',
    categoryLabel: 'Banking & Telecom Bureau',
    statutoryAuthority: 'FCRA § 605A & State Security Freeze Statutes',
    portalUrl: 'https://consumer.risk.lexisnexis.com/freeze',
    phoneNumber: '1-800-456-1244',
    mailingAddress: 'LexisNexis Consumer Center, P.O. Box 105108, Atlanta, GA 30348-5108',
    complianceEmail: 'privacy.information.mgr@lexisnexis.com',
    protectsAgainst: 'Insurance underwriting pulls, background/identity quiz impersonation, and subprime lending.',
    freeByLaw: true,
    supportsFraudAlert: false,
    slaSummary: 'Immediate online · 3 business days by mail',
  },
  {
    id: 'irs-ip-pin',
    name: 'IRS Identity Protection PIN (IP PIN)',
    category: 'federal_identity_lock',
    categoryLabel: 'Federal Identity Lock',
    statutoryAuthority: 'Taxpayer First Act § 2005 (26 U.S.C. § 6109 Note)',
    portalUrl: 'https://www.irs.gov/identity-theft-fraud-scams/get-an-identity-protection-pin',
    phoneNumber: '1-800-908-4490',
    mailingAddress: 'Department of the Treasury, Internal Revenue Service (Form 15227 if offline)',
    protectsAgainst: 'Fraudulent federal Form 1040 tax returns filed with stolen SSNs to intercept refunds.',
    freeByLaw: true,
    supportsFraudAlert: false,
    slaSummary: '6-digit PIN rotates annually every January',
  },
  {
    id: 'e-verify-self-lock',
    name: 'DHS myE-Verify Employment Self-Lock',
    category: 'federal_identity_lock',
    categoryLabel: 'Federal Identity Lock',
    statutoryAuthority: 'DHS / USCIS E-Verify Self-Lock Program',
    portalUrl: 'https://www.e-verify.gov/employees/employee-self-services/mye-verify/self-lock',
    phoneNumber: '1-888-897-7781',
    mailingAddress: 'U.S. Citizenship and Immigration Services — myE-Verify Online Portal',
    protectsAgainst: 'Employment-related SSN identity theft and unauthorized I-9 E-Verify submissions.',
    freeByLaw: true,
    supportsFraudAlert: false,
    slaSummary: 'Immediate online · Locks SSN in E-Verify for 1 year (renewable)',
  },
];

export function loadCreditFreezeState(): CreditFreezeStateMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CREDIT_FREEZE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCreditFreezeState(state: CreditFreezeStateMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CREDIT_FREEZE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota issues in restricted browsers
  }
}

export function clearCreditFreezeState(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CREDIT_FREEZE_STORAGE_KEY);
  } catch {
    // Ignore storage issues
  }
}

export interface CreditLockoutSummary {
  totalRails: number;
  frozenCount: number;
  requestedCount: number;
  thawedCount: number;
  unfrozenCount: number;
  majorBureausFrozen: number;
  majorBureausTotal: number;
  activeFraudAlertsCount: number;
  expiringOrExpiredThaws: string[];
  lockoutCoveragePercent: number;
}

export function computeCreditLockoutSummary(
  stateMap: CreditFreezeStateMap,
  nowDateIso = new Date().toISOString().slice(0, 10)
): CreditLockoutSummary {
  let frozenCount = 0;
  let requestedCount = 0;
  let thawedCount = 0;
  let majorBureausFrozen = 0;
  let activeFraudAlertsCount = 0;
  const expiringOrExpiredThaws: string[] = [];

  const majorTotal = CREDIT_FREEZE_RAILS.filter(
    (r) => r.category === 'major_credit_bureau'
  ).length;

  for (const rail of CREDIT_FREEZE_RAILS) {
    const rec = stateMap[rail.id];
    const status = rec?.status || 'unfrozen';
    if (status === 'frozen') {
      frozenCount++;
      if (rail.category === 'major_credit_bureau') majorBureausFrozen++;
    } else if (status === 'freeze_requested') {
      requestedCount++;
    } else if (status === 'temporarily_thawed') {
      thawedCount++;
      if (rec?.thawExpiresDate && rec.thawExpiresDate <= nowDateIso) {
        expiringOrExpiredThaws.push(rail.name);
      }
    }
    if (rec?.fraudAlert && rec.fraudAlert !== 'none') {
      activeFraudAlertsCount++;
    }
  }

  const totalRails = CREDIT_FREEZE_RAILS.length;
  const unfrozenCount = totalRails - frozenCount - requestedCount - thawedCount;
  const lockoutCoveragePercent = Math.round((frozenCount / totalRails) * 100);

  return {
    totalRails,
    frozenCount,
    requestedCount,
    thawedCount,
    unfrozenCount,
    majorBureausFrozen,
    majorBureausTotal: majorTotal,
    activeFraudAlertsCount,
    expiringOrExpiredThaws,
    lockoutCoveragePercent,
  };
}

export function buildStatutoryFreezeLetter(params: {
  rail: CreditFreezeRailDefinition;
  profile: UserProfile;
  templateType: FreezeNoticeTemplateType;
  senderEmail?: string;
  thawStartDate?: string;
  thawEndDate?: string;
}): { subject: string; body: string } {
  const { rail, profile, templateType } = params;
  const fullName = `${profile.firstName} ${profile.lastName}`.trim() || 'Consumer';
  const cityStateZip = [
    profile.currentCity,
    profile.currentState,
    profile.currentZip,
  ]
    .filter(Boolean)
    .join(', ');
  const addressLine = profile.currentStreet
    ? `${profile.currentStreet}, ${cityStateZip}`
    : cityStateZip || 'Current Residence';
  const contactEmail =
    params.senderEmail ||
    profile.emails.find((e) => Boolean(e && e.trim())) ||
    'yourname@email.com';
  const phoneLine = profile.phoneNumbers[0] || '[Telephone Number]';
  const birthYearLine = profile.birthYear
    ? `Birth Year: ${profile.birthYear} [Write Full DOB on Printed Mail Copy Only]`
    : '[Date of Birth — Enter on Printed Mail Copy Only]';
  const dateStr = new Date().toISOString().slice(0, 10);

  if (templateType === 'initial_fraud_alert_1yr') {
    return {
      subject: `STATUTORY 1-YEAR INITIAL FRAUD ALERT DEMAND — ${fullName} (15 U.S.C. § 1681c-1(a))`,
      body: [
        `Date: ${dateStr}`,
        `To: ${rail.name}`,
        `Address: ${rail.mailingAddress}`,
        `From: ${fullName} <${contactEmail}>`,
        '',
        'RE: STATUTORY DEMAND FOR ONE-YEAR INITIAL FRAUD ALERT (FCRA § 605A(a) / 15 U.S.C. § 1681c-1(a))',
        '',
        'To Whom It May Concern:',
        '',
        `Pursuant to Section 605A(a) of the Fair Credit Reporting Act (15 U.S.C. § 1681c-1(a)), I assert in good faith that I am or may be about to become a victim of fraud or identity theft following commercial data broker exposure of my personal identifiers.`,
        '',
        'I hereby instruct you to:',
        '1. Place an immediate ONE-YEAR INITIAL FRAUD ALERT on my consumer credit file free of charge;',
        `2. Require any prospective user of my consumer report to verify my identity via direct telephone callback at ${phoneLine} prior to establishing any new credit plan or extension of credit;`,
        '3. Refer this initial fraud alert to the other nationwide consumer reporting agencies as mandated by 15 U.S.C. § 1681c-1(a)(1)(B); and',
        '4. Exclude my name from all pre-screened credit or insurance solicitation lists for two (2) years.',
        '',
        'CONSUMER IDENTIFIERS FOR FILE MATCHING:',
        `- Full Legal Name: ${fullName}`,
        `- Current Mailing Address: ${addressLine}`,
        `- Direct Callback Phone: ${phoneLine}`,
        `- Verification Email: ${contactEmail}`,
        `- ${birthYearLine}`,
        '',
        'PRIVACY NOTICE: For security, Social Security Numbers and unredacted government ID numbers are never transmitted via unencrypted email. If mailing via Certified USPS Mail, enclose proof of residence separately.',
        '',
        'Sincerely,',
        fullName,
      ].join('\n'),
    };
  }

  if (templateType === 'extended_fraud_alert_7yr') {
    return {
      subject: `STATUTORY 7-YEAR EXTENDED FRAUD ALERT DEMAND — ${fullName} (15 U.S.C. § 1681c-1(b))`,
      body: [
        `Date: ${dateStr}`,
        `To: ${rail.name}`,
        `Address: ${rail.mailingAddress}`,
        `From: ${fullName} <${contactEmail}>`,
        '',
        'RE: EXTENDED SEVEN-YEAR FRAUD ALERT & 5-YEAR PRESCREEN EXCLUSION (15 U.S.C. § 1681c-1(b))',
        '',
        'To Whom It May Concern:',
        '',
        'Pursuant to Section 605A(b) of the Fair Credit Reporting Act (15 U.S.C. § 1681c-1(b)), please place an EXTENDED SEVEN-YEAR FRAUD ALERT on my consumer file and exclude my name from all pre-screened credit and insurance offer lists for five (5) years.',
        '',
        `Prospective creditors must contact me directly at ${phoneLine} before extending credit or opening any new account in my name.`,
        '',
        'CONSUMER IDENTIFIERS:',
        `- Full Legal Name: ${fullName}`,
        `- Current Address: ${addressLine}`,
        `- Direct Verification Phone: ${phoneLine}`,
        `- Email: ${contactEmail}`,
        `- ${birthYearLine}`,
        '- Enclosed (Printed Mail Copy Only): FTC IdentityTheft.gov Identity Theft Report',
        '',
        'Sincerely,',
        fullName,
      ].join('\n'),
    };
  }

  if (templateType === 'temporary_thaw_lift') {
    const startWindow = params.thawStartDate || dateStr;
    const endWindow = params.thawEndDate || '[Specify Automatic Re-Freeze Date]';
    return {
      subject: `TEMPORARY SECURITY FREEZE LIFT DIRECTIVE (${startWindow} TO ${endWindow}) — ${fullName}`,
      body: [
        `Date: ${dateStr}`,
        `To: ${rail.name}`,
        `Address: ${rail.mailingAddress}`,
        `From: ${fullName} <${contactEmail}>`,
        '',
        `RE: TEMPORARY LIFT OF SECURITY FREEZE FROM ${startWindow} THROUGH ${endWindow} (15 U.S.C. § 1681c-1(i)(3)(E))`,
        '',
        'To Whom It May Concern:',
        '',
        `Pursuant to 15 U.S.C. § 1681c-1(i)(3)(E), please temporarily lift the security freeze on my consumer file strictly for the date window beginning ${startWindow} and automatically re-impose the full security freeze at 11:59 PM on ${endWindow}.`,
        '',
        'CONSUMER IDENTIFIERS:',
        `- Full Legal Name: ${fullName}`,
        `- Current Address: ${addressLine}`,
        `- Phone: ${phoneLine}`,
        `- Email: ${contactEmail}`,
        '',
        'Please confirm the automatic re-freeze date in writing.',
        '',
        'Sincerely,',
        fullName,
      ].join('\n'),
    };
  }

  return {
    subject: `STATUTORY SECURITY FREEZE DEMAND — ${fullName} (FCRA § 605A / 15 U.S.C. § 1681c-1(i))`,
    body: [
      `Date: ${dateStr}`,
      `To: ${rail.name}`,
      `Address: ${rail.mailingAddress}`,
      `From: ${fullName} <${contactEmail}>`,
      '',
      `RE: MANDATORY FREE SECURITY FREEZE PLACEMENT (${rail.statutoryAuthority})`,
      '',
      'To Whom It May Concern:',
      '',
      `Pursuant to Section 605A(i) of the Fair Credit Reporting Act (15 U.S.C. § 1681c-1(i)) and applicable state security freeze statutes, I hereby demand that ${rail.name} place an immediate, free SECURITY FREEZE on my consumer file prohibiting the release of my consumer report or credit/specialty score to any third party without my express prior authorization.`,
      '',
      'Under federal law, you must:',
      '1. Place this security freeze free of any fee within one (1) business day (or three (3) business days if received by mail);',
      '2. Provide written confirmation of the freeze placement within five (5) business days along with instructions for any future temporary thaw or removal; and',
      '3. Refrain from enrolling my identity in any paid credit-monitoring or fee-bearing lock product.',
      '',
      'CONSUMER IDENTIFIERS FOR FILE MATCHING:',
      `- Full Legal Name: ${fullName}`,
      `- Current Residence Address: ${addressLine}`,
      ...(profile.previousLocations.length > 0
        ? [`- Prior Address(es): ${profile.previousLocations.slice(0, 2).join('; ')}`]
        : []),
      `- Telephone: ${phoneLine}`,
      `- Email: ${contactEmail}`,
      `- ${birthYearLine}`,
      '- SSN Safety Guard: [NEVER SEND SSN VIA EMAIL — ENTER ONLY ON CERTIFIED MAIL OR OFFICIAL HTTPS PORTAL]',
      '',
      'Please send written confirmation of my active security freeze without delay.',
      '',
      'Sincerely,',
      fullName,
    ].join('\n'),
  };
}
