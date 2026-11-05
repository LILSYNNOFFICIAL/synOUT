import { UserProfile } from '../types';

export type TcpaChannelType =
  | 'robocall'
  | 'robotext'
  | 'live_telemarketing'
  | 'b2b_cold_call';

export interface DoNotContactRegistryRail {
  id: string;
  name: string;
  scope: 'national' | 'state' | 'prescreen_mail' | 'carrier_shield';
  stateCode?: string;
  authority: string;
  portalUrl: string;
  phoneAction?: string;
  effectSummary: string;
}

export interface TcpaViolationEntry {
  id: string;
  callerName: string;
  callerPhone: string;
  callerEmail?: string;
  callerDomain?: string;
  channel: TcpaChannelType;
  revocationSentAtIso: string;
  postRevocationCallDates: string[];
  willfulViolation: boolean;
  notes?: string;
}

export interface TelemarketingShieldState {
  completedRegistryIds: string[];
  violations: TcpaViolationEntry[];
  updatedAtIso: string;
}

const TCPA_SHIELD_STORAGE_KEY = 'synout_tcpa_shield_v1';

export const DO_NOT_CONTACT_RAILS: DoNotContactRegistryRail[] = [
  {
    id: 'ftc-national-dnc',
    name: 'FTC National Do Not Call Registry',
    scope: 'national',
    authority: '16 CFR Part 310 (Telemarketing Sales Rule) & 47 CFR § 64.1200',
    portalUrl: 'https://www.donotcall.gov/',
    phoneAction: '1-888-382-1222 (call from the phone you wish to register)',
    effectSummary: 'Permanently prohibits commercial telemarketers from calling registered mobile or landline numbers after 31 days.',
  },
  {
    id: 'fcra-optout-prescreen',
    name: 'OptOutPrescreen (Credit & Insurance Mailers)',
    scope: 'prescreen_mail',
    authority: 'FCRA § 604(e) (15 U.S.C. § 1681b(e))',
    portalUrl: 'https://www.optoutprescreen.com/',
    phoneAction: '1-888-567-8688',
    effectSummary: 'Stops Equifax, Experian, TransUnion, and Innovis from selling your name on pre-approved credit card and insurance offer lists (5-year online or permanent mail election).',
  },
  {
    id: 'ana-dmachoice',
    name: 'DMAchoice Direct Mail & Catalog Suppression',
    scope: 'prescreen_mail',
    authority: 'Association of National Advertisers Consumer Suppression List',
    portalUrl: 'https://www.dmachoice.org/',
    effectSummary: 'Suppresses physical junk mail, catalogs, and magazine prospect lists for 10 years across participating direct-mail brokers.',
  },
  {
    id: 'ctia-7726-spam',
    name: 'Carrier 7726 (SPAM) SMS Reporting & Call Filter',
    scope: 'carrier_shield',
    authority: 'FCC STIR/SHAKEN & Mobile Carrier Messaging Firewall',
    portalUrl: 'https://consumercomplaints.fcc.gov/hc/en-us/articles/115002234203-Unwanted-Calls-Texts-Phone',
    phoneAction: 'Forward unwanted smishing/robotexts to short code 7726 (SPAM)',
    effectSummary: 'Feeds originating sender numbers directly into AT&T ActiveArmor, T-Mobile Scam Shield, and Verizon Call Filter blocklists.',
  },
  {
    id: 'state-dnc-co',
    name: 'Colorado No-Call List',
    scope: 'state',
    stateCode: 'CO',
    authority: 'Colorado No-Call List Act (C.R.S. § 6-1-901)',
    portalUrl: 'https://www.coloradonocall.com/',
    effectSummary: 'Additional state-level enforcement & penalties for Colorado residential and wireless subscribers.',
  },
  {
    id: 'state-dnc-fl',
    name: 'Florida Do Not Call Program (FDACS)',
    scope: 'state',
    stateCode: 'FL',
    authority: 'Florida Telemarketing Act (Fla. Stat. § 501.059)',
    portalUrl: 'https://www.fdacs.gov/Consumer-Resources/Do-Not-Call',
    effectSummary: 'Enforces strict Florida state statutory penalties against unsolicited telemarketing calls and automated texts.',
  },
  {
    id: 'state-dnc-in',
    name: 'Indiana Do Not Call / Telephone Privacy List',
    scope: 'state',
    stateCode: 'IN',
    authority: 'Indiana Telephone Solicitation Act (IC 24-4.7)',
    portalUrl: 'https://www.in.gov/attorneygeneral/consumer-protection-division/do-not-calltext-complaint/',
    effectSummary: 'Indiana Attorney General wireless & residential telemarketing and text suppression list.',
  },
  {
    id: 'state-dnc-ma',
    name: 'Massachusetts Do Not Call Registry',
    scope: 'state',
    stateCode: 'MA',
    authority: 'Mass. Gen. Laws ch. 159C',
    portalUrl: 'https://www.mass.gov/do-not-call-registry',
    effectSummary: 'Massachusetts state telemarketing prohibition list supplementing federal FTC registration.',
  },
  {
    id: 'state-dnc-pa',
    name: 'Pennsylvania Do Not Call List',
    scope: 'state',
    stateCode: 'PA',
    authority: 'PA Telemarketer Registration Act (73 P.S. § 2241)',
    portalUrl: 'https://www.attorneygeneral.gov/protect-yourself/do-not-call-list/',
    effectSummary: 'Permanent Pennsylvania Attorney General registration covering both landlines and mobile numbers.',
  },
  {
    id: 'state-dnc-tx',
    name: 'Texas No Call Lists (PUC)',
    scope: 'state',
    stateCode: 'TX',
    authority: 'Tex. Bus. & Com. Code Ch. 304',
    portalUrl: 'https://www.texasnocall.com/',
    effectSummary: 'Texas Public Utility Commission statewide telemarketing & electric-provider no-call registry.',
  },
];

export function loadTelemarketingShieldState(): TelemarketingShieldState {
  if (typeof window === 'undefined') {
    return { completedRegistryIds: [], violations: [], updatedAtIso: new Date().toISOString() };
  }
  try {
    const raw = window.localStorage.getItem(TCPA_SHIELD_STORAGE_KEY);
    if (!raw) {
      return { completedRegistryIds: [], violations: [], updatedAtIso: new Date().toISOString() };
    }
    const parsed = JSON.parse(raw);
    return {
      completedRegistryIds: Array.isArray(parsed?.completedRegistryIds)
        ? parsed.completedRegistryIds
        : [],
      violations: Array.isArray(parsed?.violations) ? parsed.violations : [],
      updatedAtIso:
        typeof parsed?.updatedAtIso === 'string' ? parsed.updatedAtIso : new Date().toISOString(),
    };
  } catch {
    return { completedRegistryIds: [], violations: [], updatedAtIso: new Date().toISOString() };
  }
}

export function saveTelemarketingShieldState(state: TelemarketingShieldState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TCPA_SHIELD_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota issues
  }
}

export function clearTelemarketingShieldState(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(TCPA_SHIELD_STORAGE_KEY);
  } catch {
    // Ignore storage issues
  }
}

export interface TcpaDamagesCalculation {
  totalTrackedCallers: number;
  totalPostRevocationCalls: number;
  baseStatutoryDamagesUsd: number;
  treblePotentialDamagesUsd: number;
  perCallerBreakdown: Array<{
    id: string;
    callerName: string;
    callerPhone: string;
    callCount: number;
    baseUsd: number;
    effectiveUsd: number;
  }>;
}

/**
 * Computes statutory damages under 47 U.S.C. § 227(b)(3) and § 227(c)(5):
 * $500 per unlawful post-revocation automated call/text, or up to $1,500 per willful/knowing violation.
 */
export function calculateTcpaDamages(violations: TcpaViolationEntry[]): TcpaDamagesCalculation {
  let totalPostRevocationCalls = 0;
  let baseStatutoryDamagesUsd = 0;
  let treblePotentialDamagesUsd = 0;

  const perCallerBreakdown = violations.map((v) => {
    const callCount = Array.isArray(v.postRevocationCallDates)
      ? v.postRevocationCallDates.length
      : 0;
    const baseUsd = callCount * 500;
    const effectiveUsd = callCount * (v.willfulViolation ? 1500 : 500);
    totalPostRevocationCalls += callCount;
    baseStatutoryDamagesUsd += baseUsd;
    treblePotentialDamagesUsd += effectiveUsd;
    return {
      id: v.id,
      callerName: v.callerName,
      callerPhone: v.callerPhone,
      callCount,
      baseUsd,
      effectiveUsd,
    };
  });

  return {
    totalTrackedCallers: violations.length,
    totalPostRevocationCalls,
    baseStatutoryDamagesUsd,
    treblePotentialDamagesUsd,
    perCallerBreakdown,
  };
}

export function buildTcpaRevocationDemand(params: {
  callerName: string;
  callerPhone: string;
  callerEmail?: string;
  channel: TcpaChannelType;
  profile: UserProfile;
  senderEmail?: string;
}): {
  subject: string;
  emailBody: string;
  smsReplyText: string;
} {
  const fullName =
    `${params.profile.firstName} ${params.profile.lastName}`.trim() || 'Protected Subscriber';
  const subscriberPhones =
    params.profile.phoneNumbers.filter(Boolean).join(', ') || '[Subscriber Telephone Number]';
  const contactEmail =
    params.senderEmail ||
    params.profile.emails.find((e) => Boolean(e && e.trim())) ||
    'yourname@email.com';
  const dateIso = new Date().toISOString().slice(0, 10);

  const subject = `FORMAL TCPA CONSENT REVOCATION & INTERNAL DO-NOT-CALL DEMAND — ${fullName} (47 U.S.C. § 227 / 47 CFR § 64.1200)`;

  const emailBody = [
    `Date: ${dateIso}`,
    `To: ${params.callerName}${params.callerEmail ? ` <${params.callerEmail}>` : ''}`,
    `Originating Number / Short Code: ${params.callerPhone}`,
    `From: ${fullName} <${contactEmail}>`,
    '',
    'RE: EXPRESS REVOCATION OF PRIOR CONSENT & INTERNAL DO-NOT-CALL DEMAND (47 U.S.C. § 227; 47 CFR § 64.1200(a)(10) & (d))',
    '',
    'To Legal & Compliance Officer:',
    '',
    `Please take formal notice that I, ${fullName}, the subscriber and customary user of telephone number(s) ${subscriberPhones} and email ${contactEmail}, hereby UNEQUIVOCALLY REVOKE any purported prior express consent or prior express written consent to receive artificial/prerecorded voice calls, ATDS calls, SMS/MMS text messages, or telemarketing communications from ${params.callerName}, its affiliates, lead generators, or calling vendors.`,
    '',
    'MANDATORY LEGAL OBLIGATIONS:',
    '1. Pursuant to 47 CFR § 64.1200(a)(10) (FCC Consent Revocation Order) and 47 CFR § 64.1200(d)(3), you must honor this revocation and add my telephone number(s) and email address to your permanent company-specific Internal Do-Not-Call list as soon as practicable and no later than ten (10) business days from receipt.',
    '2. Under CAN-SPAM (15 U.S.C. § 7704) and state privacy laws (including CCPA/CPRA § 1798.120 where applicable), you must cease selling, sharing, or transferring my contact information to external lead brokers.',
    '3. Please preserve all call detail records (CDRs), lead-source certificates, and dialing logs associated with my number(s). Every subsequent call or text placed in violation of 47 U.S.C. § 227(b) or § 227(c) carries statutory liability of $500 to $1,500 per call/message.',
    '',
    `Please confirm permanent suppression in writing to ${contactEmail} without making any further telephone or SMS contact.`,
    '',
    'Sincerely,',
    fullName,
  ].join('\n');

  const smsReplyText = `STOP. Formal notice under 47 USC 227 & 47 CFR 64.1200: I revoke all call/SMS consent & demand immediate placement on ${params.callerName}'s internal Do-Not-Call list.`;

  return {
    subject,
    emailBody,
    smsReplyText,
  };
}

export function exportTcpaViolationsCsv(violations: TcpaViolationEntry[]): string {
  const escapeCsv = (val: string | number | boolean) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const headers = [
    'Caller / Entity',
    'Originating Phone',
    'Compliance Email',
    'Channel',
    'Revocation Sent Date',
    'Post-Revocation Call Count',
    'Post-Revocation Call Dates',
    'Willful (Treble $1,500)',
    'Estimated Statutory Damages (USD)',
    'Notes',
  ];

  const rows = violations.map((v) => {
    const count = v.postRevocationCallDates.length;
    const usd = count * (v.willfulViolation ? 1500 : 500);
    return [
      v.callerName,
      v.callerPhone,
      v.callerEmail || '',
      v.channel,
      v.revocationSentAtIso,
      count,
      v.postRevocationCallDates.join(' | '),
      v.willfulViolation ? 'Yes' : 'No',
      usd,
      v.notes || '',
    ]
      .map(escapeCsv)
      .join(',');
  });

  return [headers.map(escapeCsv).join(','), ...rows].join('\n');
}
