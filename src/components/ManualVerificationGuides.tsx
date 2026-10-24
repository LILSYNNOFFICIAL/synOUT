import React, { useState } from 'react';
import { UserProfile } from '../types';
import {
  useEmailConnection,
  sendEmailViaConnectedAccount,
} from '../services/emailConnectionStore';
import { BureauChecklistState } from '../utils/workspaceVault';
import { copyTextToClipboard } from '../utils/exportEngines';
import {
  ShieldCheck,
  Building2,
  ExternalLink,
  Phone,
  MapPin,
  FileText,
  CheckCircle2,
  Copy,
  Check,
  AlertTriangle,
  ChevronRight,
  Lock,
  Mail,
  Send,
  RefreshCw,
} from 'lucide-react';

interface ManualVerificationGuidesProps {
  profile: UserProfile;
  bureauProgress?: Record<string, BureauChecklistState>;
  onUpdateBureauProgress?: (
    bureauId: string,
    patch: Partial<BureauChecklistState>
  ) => void;
  onOpenConnectEmail?: () => void;
}

interface BureauGuide {
  id: string;
  name: string;
  domain: string;
  complianceEmail?: string;
  category:
    | 'Public Record Clearinghouse'
    | 'Specialty Consumer Bureau'
    | 'Pre-Screen & Direct Marketing'
    | 'Telco, Payroll & State Registry';
  overview: string;
  whyManual: string;
  phone: string;
  address: string;
  portalUrl: string;
  statutoryBasis: string;
  timeline: string;
  requiredDocuments: string[];
  instructions: string[];
  letterTemplate: (profile: UserProfile, senderEmail?: string) => string;
}

export const BUREAU_GUIDES: BureauGuide[] = [
  {
    id: 'lexisnexis',
    name: 'LexisNexis Consumer Center',
    domain: 'lexisnexis.com',
    complianceEmail: 'privacy.information.requests@lexisnexis.com',
    category: 'Public Record Clearinghouse',
    overview:
      'The largest consumer intelligence and background data clearinghouse in North America.',
    whyManual:
      'LexisNexis requires formal identity verification for FCRA consumer file freezes alongside electronic CCPA/DPPA privacy suppression notices.',
    phone: '1-888-497-0011',
    address:
      'LexisNexis Risk Solutions Consumer Center, P.O. Box 105108, Atlanta, GA 30348-5108',
    portalUrl: 'https://optout.lexisnexis.com/',
    statutoryBasis:
      'Driver’s Privacy Protection Act (DPPA), CCPA § 1798.105 & FCRA § 609',
    timeline: '30 Calendar Days',
    requiredDocuments: [
      'Copy of government-issued Photo ID (for postal PIN verification)',
      'Proof of current physical address (utility bill within 90 days)',
      'Signed consumer verification declaration',
    ],
    instructions: [
      'Transmit the formal statutory CCPA/DPPA suppression notice to the LexisNexis Privacy Compliance desk below or copy for postal mail.',
      'Open the official LexisNexis Opt-Out portal using the button above to initiate PIN verification.',
      'Select your suppression justification (State Privacy Rights or Identity Protection) and submit.',
      'Retain the postal confirmation PIN letter sent within 14 days and mark PIN Saved below.',
    ],
    letterTemplate: (p, email) =>
      `DATE: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
TO: LexisNexis Risk Solutions Consumer Privacy Center <privacy.information.requests@lexisnexis.com>
P.O. Box 105108, Atlanta, GA 30348-5108

RE: FORMAL DEMAND FOR CONSUMER DISCLOSURE & PUBLIC DIRECTORY SUPPRESSION (CCPA / DPPA / FCRA)

Consumer: ${p.firstName} ${p.lastName}
Address: ${p.currentCity}, ${p.currentState} ${p.currentZip || ''}
Contact Email: ${email || p.emails[0] || 'On file'}
Contact Phone: ${p.phoneNumbers[0] || 'On file'}

Under applicable state consumer privacy statutes (including CCPA/CPRA Cal. Civ. Code § 1798.105 and state omnibus laws), I demand complete suppression and opt-out of sale/sharing of my personal records across LexisNexis public directory, Accurint non-exempt marketing, and people-lookup products.

Sincerely,
${p.firstName} ${p.lastName}`,
  },
  {
    id: 'corelogic',
    name: 'CoreLogic Credco & Teletrack',
    domain: 'corelogic.com',
    complianceEmail: 'privacy@corelogic.com',
    category: 'Public Record Clearinghouse',
    overview:
      'Aggregates municipal court filings, real property ownership, deed transfers, rental screening, and tax assessments.',
    whyManual:
      'Property and FCRA credit files require consumer validation, while marketing and non-exempt data broker profiles accept direct CCPA privacy demands.',
    phone: '1-800-637-2422',
    address:
      'CoreLogic Credco, Consumer Relations, P.O. Box 509124, San Diego, CA 92150',
    portalUrl: 'https://www.corelogic.com/intelligence/consumer-relations/',
    statutoryBasis:
      'Fair Credit Reporting Act & State Consumer Privacy Suppression Statutes',
    timeline: '15–30 Calendar Days',
    requiredDocuments: ['Proof of residency at current property'],
    instructions: [
      'Send the statutory privacy & marketing suppression notice directly to privacy@corelogic.com below.',
      'Access CoreLogic Consumer Relations via the official portal to request your FCRA Consumer Disclosure File.',
      'Place a security freeze on CoreLogic Teletrack / Rental Property Solutions if desired.',
    ],
    letterTemplate: (p, email) =>
      `DATE: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
TO: CoreLogic Privacy Compliance <privacy@corelogic.com>
CoreLogic Credco, P.O. Box 509124, San Diego, CA 92150

RE: STATUTORY CCPA/CPRA DATA DELETION & MARKETING SUPPRESSION DEMAND

Consumer: ${p.firstName} ${p.lastName}
Primary Jurisdiction: ${p.currentCity}, ${p.currentState} ${p.currentZip || ''}
Contact Email: ${email || p.emails[0] || 'On file'}

Pursuant to state privacy statutes, please purge and suppress my personal contact and property marketing dossier from all commercial resale feeds and confirm compliance in writing.

Sincerely,
${p.firstName} ${p.lastName}`,
  },
  {
    id: 'theworknumber',
    name: 'The Work Number (Equifax Workforce Solutions)',
    domain: 'theworknumber.com',
    complianceEmail: 'privacy@equifax.com',
    category: 'Telco, Payroll & State Registry',
    overview:
      'Centralized commercial payroll and employment history clearinghouse collecting pay-stub salaries and job tenures from thousands of employers.',
    whyManual:
      'Placing an Employment Data Freeze requires authenticating via Equifax Workforce Solutions online or phone to receive a freeze PIN.',
    phone: '1-800-367-2884',
    address:
      'Equifax Workforce Solutions, Attn: ConsumerFreeze, 11432 Lackland Road, St. Louis, MO 63146',
    portalUrl: 'https://employees.theworknumber.com/employee-data-freeze',
    statutoryBasis: 'FCRA § 605A & State Employment Privacy Protections',
    timeline: '1–3 Business Days Online',
    requiredDocuments: ['Employer code or SSN verification on official employee portal'],
    instructions: [
      'Open The Work Number Employee Data Freeze portal via the button above.',
      'Request your free Employment Data Report (EDR) to inspect every pay-period record on file.',
      'Place an Employment Data Freeze so background check firms and lenders cannot pull salary records without your PIN.',
      'Optionally dispatch a non-FCRA marketing opt-out notice to privacy@equifax.com below.',
    ],
    letterTemplate: (p, email) =>
      `DATE: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
TO: Equifax Workforce Solutions Privacy Office <privacy@equifax.com>
11432 Lackland Road, St. Louis, MO 63146

RE: CONSUMER PRIVACY OPT-OUT OF NON-EXEMPT DATA SHARING & EMPLOYMENT DATA FREEZE NOTICE

Consumer: ${p.firstName} ${p.lastName} (${p.currentCity}, ${p.currentState})
Contact Email: ${email || p.emails[0] || 'On file'}

Pursuant to state consumer privacy laws, opt my personal identifiers out of all non-FCRA commercial marketing, analytics, and secondary data licensing programs.

Sincerely,
${p.firstName} ${p.lastName}`,
  },
  {
    id: 'nctue',
    name: 'NCTUE (National Consumer Telecom & Utilities Exchange)',
    domain: 'nctue.com',
    category: 'Telco, Payroll & State Registry',
    overview:
      'Specialty exchange sharing mobile phone, broadband internet, cable TV, electric, gas, and water utility account histories.',
    whyManual:
      'Managed by Equifax Information Services; security freezes must be placed through the NCTUE consumer portal, phone IVR, or postal mail.',
    phone: '1-866-349-5355',
    address: 'NCTUE Security Freeze, P.O. Box 105561, Atlanta, GA 30348',
    portalUrl: 'https://nctue.com/consumers/',
    statutoryBasis: 'Fair Credit Reporting Act (15 U.S.C. § 1681c-1)',
    timeline: 'Immediate Online / Phone (3 Days Mail)',
    requiredDocuments: ['Current utility service billing address and identity verification'],
    instructions: [
      'Open NCTUE Consumer Services via the official portal button above or call 1-866-349-5355.',
      'Place a free NCTUE Security Freeze to block unauthorized wireless SIM-swap credit checks and utility inquiries.',
      'Request your annual NCTUE disclosure report to audit historical phone and address linkages.',
    ],
    letterTemplate: (p) =>
      `DATE: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
TO: NCTUE Security Freeze, P.O. Box 105561, Atlanta, GA 30348

RE: FCRA SECURITY FREEZE & ANNUAL DISCLOSURE REQUEST (15 U.S.C. § 1681c-1)

Consumer: ${p.firstName} ${p.lastName} (${p.currentCity}, ${p.currentState} ${p.currentZip || ''})
Please place a security freeze on my NCTUE telecommunications and utility exchange file and mail confirmation.`,
  },
  {
    id: 'sagestream',
    name: 'SageStream (LexisNexis Risk Subsidiary)',
    domain: 'sagestreamllc.com',
    complianceEmail: 'privacy@sagestreamllc.com',
    category: 'Specialty Consumer Bureau',
    overview:
      'Supplementary consumer reporting bureau scoring auto loans, wireless utility applications, and retail credit risk.',
    whyManual:
      'Security freezes require identity verification PINs; privacy suppression demands can be submitted electronically and via consumer portal.',
    phone: '1-888-395-0277',
    address:
      'SageStream, LLC Consumer Office, P.O. Box 503793, San Diego, CA 92150',
    portalUrl: 'https://www.sagestreamllc.com/security-freeze/',
    statutoryBasis: 'FCRA § 605A & State Consumer Data Privacy Laws',
    timeline: '15–30 Calendar Days',
    requiredDocuments: ['Government Photo ID and proof of current address'],
    instructions: [
      'Send the electronic statutory privacy suppression notice to privacy@sagestreamllc.com using your connected email below.',
      'Visit the SageStream Security Freeze portal to lock credit risk scoring inquiries.',
    ],
    letterTemplate: (p, email) =>
      `DATE: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
TO: SageStream Consumer Privacy Office <privacy@sagestreamllc.com>
P.O. Box 503793, San Diego, CA 92150

RE: CONSUMER PRIVACY OPT-OUT & NON-FCRA MARKETING SUPPRESSION

Consumer: ${p.firstName} ${p.lastName} (${p.currentCity}, ${p.currentState})
Email: ${email || p.emails[0] || 'On file'}

Please suppress all non-exempt commercial marketing and identity-graph sharing associated with my consumer profile and confirm compliance in writing.

Sincerely,
${p.firstName} ${p.lastName}`,
  },
  {
    id: 'mib',
    name: 'MIB Group (Medical Information Bureau)',
    domain: 'mib.com',
    complianceEmail: 'infocenter@mib.com',
    category: 'Specialty Consumer Bureau',
    overview:
      'Underwriting clearinghouse used by life, health, and disability insurance carriers across North America.',
    whyManual:
      'Underwriting disclosures are protected by FCRA and HIPAA; consumers should request their annual MIB disclosure file to verify zero erroneous codes exist.',
    phone: '1-866-692-6901',
    address: 'MIB, Inc., 50 Braintree Hill Park, Suite 400, Braintree, MA 02184-8734',
    portalUrl: 'https://www.mib.com/request_your_record.html',
    statutoryBasis: 'Fair Credit Reporting Act (15 U.S.C. § 1681j) & HIPAA',
    timeline: '15 Business Days',
    requiredDocuments: ['Legal name, date of birth, and current residential address'],
    instructions: [
      'Request your free annual MIB Consumer File Disclosure online at mib.com or call 1-866-692-6901.',
      'Optionally dispatch a formal consumer inquiry/suppression notice to infocenter@mib.com below.',
    ],
    letterTemplate: (p, email) =>
      `DATE: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
TO: MIB Consumer Information Center <infocenter@mib.com>
50 Braintree Hill Park, Suite 400, Braintree, MA 02184

RE: CONSUMER PRIVACY INQUIRY & MARKETING OPT-OUT NOTICE

Consumer: ${p.firstName} ${p.lastName} (${p.currentCity}, ${p.currentState})
Email: ${email || p.emails[0] || 'On file'}

Please ensure my personal contact details are excluded from any non-underwriting secondary marketing lists and provide instructions for any open file verification.

Sincerely,
${p.firstName} ${p.lastName}`,
  },
  {
    id: 'chexsystems',
    name: 'ChexSystems Consumer Relations',
    domain: 'chexsystems.com',
    category: 'Specialty Consumer Bureau',
    overview:
      'Specialty consumer reporting agency tracking retail banking history, overdrafts, and checking account openings.',
    whyManual:
      'Governed strictly by FCRA; ChexSystems requires direct consumer portal authentication or postal mail to place a banking security freeze.',
    phone: '1-800-428-9623',
    address:
      'Chex Systems, Inc., Attn: Consumer Relations, P.O. Box 583399, Minneapolis, MN 55458',
    portalUrl: 'https://www.chexsystems.com/security-freeze/place-freeze',
    statutoryBasis: 'Fair Credit Reporting Act (15 U.S.C. § 1681c-1)',
    timeline: '1–5 Business Days Online (15 Days Mail)',
    requiredDocuments: ['SSN last 4 digits', 'Current and prior 5-year address trail'],
    instructions: [
      'Visit the ChexSystems Security Freeze portal via the button above (portal/mail only—no unauthenticated email freezes).',
      'Authenticate identity through consumer verification questions.',
      'Place a free Security Freeze on your banking consumer report and save your PIN.',
    ],
    letterTemplate: (p) =>
      `DATE: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
TO: Chex Systems, Inc., Attn: Consumer Relations
P.O. Box 583399, Minneapolis, MN 55458

RE: CONSUMER DISCLOSURE AND FCRA SECURITY FREEZE REQUEST

Consumer: ${p.firstName} ${p.lastName} (${p.currentCity}, ${p.currentState})
Please place a security freeze on my consumer banking file pursuant to 15 U.S.C. § 1681c-1 and confirm marketing opt-out in writing.`,
  },
  {
    id: 'innovis',
    name: 'Innovis Consumer Assistance',
    domain: 'innovis.com',
    category: 'Specialty Consumer Bureau',
    overview: 'The fourth national credit and consumer identity reporting agency.',
    whyManual:
      'Requires direct portal submission or postal mail to match against credit registry files and issue a consumer freeze PIN.',
    phone: '1-800-540-2505',
    address: 'Innovis Consumer Assistance, P.O. Box 530088, Atlanta, GA 30353',
    portalUrl: 'https://www.innovis.com/personal/optOut',
    statutoryBasis: 'FCRA § 604 & Consumer Privacy Opt-Out Regulations',
    timeline: 'Immediate Online (3–5 Days Mail)',
    requiredDocuments: ['Full legal name and address history'],
    instructions: [
      'Open the Innovis Opt-Out web portal via the button above.',
      'Select Opt-Out of Pre-Approved Credit and Insurance Offers and also place an Innovis Security Freeze.',
      'Complete the secure web form or mail the pre-filled notice below.',
    ],
    letterTemplate: (p) =>
      `DATE: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
TO: Innovis Consumer Assistance, P.O. Box 530088, Atlanta, GA 30353
RE: PERMANENT PRE-SCREEN OPT-OUT & SECURITY FREEZE NOTICE (FCRA § 604)

Consumer: ${p.firstName} ${p.lastName} (${p.currentCity}, ${p.currentState})`,
  },
  {
    id: 'optoutprescreen',
    name: 'OptOutPrescreen (Equifax, Experian, TransUnion, Innovis)',
    domain: 'optoutprescreen.com',
    category: 'Pre-Screen & Direct Marketing',
    overview:
      'The official joint credit bureau clearinghouse to opt out of firm offers of credit or insurance.',
    whyManual:
      '5-year electronic opt-out is instant on OptOutPrescreen.com; permanent lifetime opt-out requires printing, signing, and mailing their election form.',
    phone: '1-888-567-8688',
    address: 'Opt-Out Request, P.O. Box 505, Woodbury, NY 11797',
    portalUrl: 'https://www.optoutprescreen.com/',
    statutoryBasis: 'Fair Credit Reporting Act (15 U.S.C. § 1681b)',
    timeline: 'Immediate for 5-Year (Permanent upon signed mail election)',
    requiredDocuments: ['Legal name and SSN/DOB on official portal'],
    instructions: [
      'Access OptOutPrescreen.com via the official portal button above.',
      'Select Electronic Opt-Out for 5 years (instant) or Permanent Opt-Out by Mail.',
      'For permanent removal, sign and mail the generated election notice.',
    ],
    letterTemplate: (p) =>
      `DATE: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
TO: OptOutPrescreen Consumer Processing, P.O. Box 505, Woodbury, NY 11797
RE: NOTICE OF PERMANENT OPT-OUT ELECTION (15 U.S.C. § 1681b)

Consumer: ${p.firstName} ${p.lastName} (${p.currentCity}, ${p.currentState})`,
  },
  {
    id: 'dmachoice',
    name: 'DMAchoice & DirectMail.com National Do Not Mail',
    domain: 'dmachoice.org',
    complianceEmail: 'ethics@ana.net',
    category: 'Pre-Screen & Direct Marketing',
    overview:
      'Association of National Advertisers (ANA) direct-mail suppression registry cutting physical catalog, magazine, and postal list-broker resale.',
    whyManual:
      'Physical postal list brokers sync quarterly against ANA DMAchoice and DirectMail.com National Do Not Mail lists.',
    phone: '1-212-697-5000',
    address:
      'ANA / DMAchoice Mail Preference Service, 225 Reinekers Lane, Suite 325, Alexandria, VA 22314',
    portalUrl: 'https://dmachoice.org/',
    statutoryBasis: 'ANA Ethical Direct Marketing Guidelines & State Opt-Out Statutes',
    timeline: '30–60 Days (10-Year Suppression)',
    requiredDocuments: ['Current and previous residential mailing addresses'],
    instructions: [
      'Register your residential address on DMAchoice.org (covers 10 years of ANA member postal list suppression).',
      'Also register free on DirectMail.com/mail_preference/ to suppress regional retail list brokers.',
      'Optionally email ANA Marketing Ethics compliance below to report persistent direct-mail list resale.',
    ],
    letterTemplate: (p, email) =>
      `DATE: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
TO: ANA / DMAchoice Mail Preference Compliance <ethics@ana.net>

RE: DIRECT MAIL LIST-BROKER SUPPRESSION ELECTION

Consumer: ${p.firstName} ${p.lastName}
Mailing Address: ${p.currentCity}, ${p.currentState} ${p.currentZip || ''}
Contact Email: ${email || p.emails[0] || 'On file'}

Please record my household name and residential address on all direct-mail prospect suppression feeds.`,
  },
  {
    id: 'donotcall_cnam',
    name: 'National Do Not Call & Wireless Caller ID (CNAM / CPNI)',
    domain: 'donotcall.gov',
    category: 'Telco, Payroll & State Registry',
    overview:
      'FTC National Do Not Call Registry plus wireless carrier Customer Proprietary Network Information (CPNI) and outbound Caller-ID directory suppression.',
    whyManual:
      'FTC requires phone/email verification link click from the target telephone or email; wireless carriers require account holder toggle.',
    phone: '1-888-382-1222',
    address: 'Federal Trade Commission, Do Not Call Registry, 600 Pennsylvania Ave NW, Washington, DC 20580',
    portalUrl: 'https://www.donotcall.gov/',
    statutoryBasis: 'Telemarketing Sales Rule (16 C.F.R. Part 310) & 47 U.S.C. § 222 (FCC CPNI)',
    timeline: '31 Days Statutory Telemarketing Ban (Permanent Registration)',
    requiredDocuments: ['Access to each mobile/landline number being registered'],
    instructions: [
      'Open DoNotCall.gov and register up to 3 personal phone numbers at a time, then click the FTC verification email within 72 hours.',
      'In your wireless carrier app (AT&T, Verizon, T-Mobile), disable CPNI Marketing Sharing and set Outbound Caller ID Name (CNAM) to "Wireless Caller" so reverse-phone brokers cannot harvest your name from call logs.',
      'Check "Freeze / Suppression Completed" below once all phone lines are registered.',
    ],
    letterTemplate: (p) =>
      `TELECOM CPNI & CALLER ID SUPPRESSION CHECKLIST FOR ${p.firstName.toUpperCase()} ${p.lastName.toUpperCase()}
Phones on Profile: ${p.phoneNumbers.join(', ') || 'Add phone numbers in Scan Form'}
1. FTC National Do Not Call Registry: https://www.donotcall.gov/ (1-888-382-1222 from target phone)
2. AT&T CPNI Opt-Out: https://www.att.com/cpni/optout
3. Verizon Privacy & CPNI Preferences: https://www.verizon.com/privacy
4. T-Mobile Privacy Dashboard (Do Not Sell/Share & CPNI): https://www.t-mobile.com/privacy-center`,
  },
  {
    id: 'ca_delete_act',
    name: 'State Data Broker Registries & CA Delete Act (DROP)',
    domain: 'cppa.ca.gov',
    complianceEmail: 'databrokers@cppa.ca.gov',
    category: 'Telco, Payroll & State Registry',
    overview:
      'Official state statutory registries (California CPPA SB 362 DROP, Texas Secretary of State Ch. 509, Vermont, Oregon) regulating registered commercial data brokers.',
    whyManual:
      'State enforcement registries maintain authoritative lists of 500+ registered data brokers subject to daily statutory non-compliance fines.',
    phone: '1-916-263-0859',
    address: 'California Privacy Protection Agency, 2101 Arena Blvd, Sacramento, CA 95834',
    portalUrl: 'https://cppa.ca.gov/data_broker_registry/',
    statutoryBasis: 'California Delete Act (SB 362 / Cal. Civ. Code § 1798.99.80) & TX Bus. & Com. Code Ch. 509',
    timeline: '45 Calendar Days Mandatory Recurring Purge',
    requiredDocuments: ['Residency verification for state single-window mechanisms'],
    instructions: [
      'Inspect the official CPPA Data Broker Registry via the button above to cross-check registered entities.',
      'Use synOUT "Opt Out of All" to transmit individual statutory notices now, and retain your SMTP Message-ID receipts for CPPA enforcement.',
      'Report unregistered or non-compliant brokers directly to databrokers@cppa.ca.gov below.',
    ],
    letterTemplate: (p, email) =>
      `DATE: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
TO: California Privacy Protection Agency — Data Broker Registry Division <databrokers@cppa.ca.gov>

RE: CONSUMER DATA BROKER COMPLIANCE INQUIRY (CAL. CIV. CODE § 1798.99.80)

Consumer: ${p.firstName} ${p.lastName} (${p.currentCity}, ${p.currentState})
Contact Email: ${email || p.emails[0] || 'On file'}

Please record this consumer inquiry regarding registered data broker compliance with 45-day statutory deletion mandates.`,
  },
];

export const ManualVerificationGuides: React.FC<ManualVerificationGuidesProps> = ({
  profile,
  bureauProgress = {},
  onUpdateBureauProgress,
  onOpenConnectEmail,
}) => {
  const { isDirectSendConnected, activeConnectedEmail } = useEmailConnection();
  const [selectedBureauId, setSelectedBureauId] = useState<string>(BUREAU_GUIDES[0].id);
  const [copiedLetter, setCopiedLetter] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [bccSelf, setBccSelf] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [localReceipts, setLocalReceipts] = useState<Record<string, string>>({});

  const selectedBureau =
    BUREAU_GUIDES.find((b) => b.id === selectedBureauId) || BUREAU_GUIDES[0];
  const letterText = selectedBureau.letterTemplate(profile, activeConnectedEmail || undefined);
  const progressForSelected = bureauProgress[selectedBureau.id];
  const currentReceipt =
    localReceipts[selectedBureau.id] || progressForSelected?.emailSentReceipt;

  const completedFreezesCount = BUREAU_GUIDES.filter(
    (b) => bureauProgress[b.id]?.freezePlaced
  ).length;

  const handleSelectBureau = (id: string) => {
    setSelectedBureauId(id);
    setConfirmSend(false);
    setSendError(null);
  };

  const handleCopy = () => {
    void copyTextToClipboard(letterText);
    setCopiedLetter(true);
    setTimeout(() => setCopiedLetter(false), 2000);
  };

  const handleSendBureauEmail = async () => {
    if (!selectedBureau.complianceEmail) return;
    setIsSending(true);
    setSendError(null);
    try {
      const fullName = `${profile.firstName} ${profile.lastName}`.trim() || 'Authorized Consumer';
      const subject = `LEGAL NOTICE: Consumer Privacy Suppression & Disclosure Demand - ${fullName}`;
      const res = await sendEmailViaConnectedAccount({
        recipientEmail: selectedBureau.complianceEmail,
        subject,
        body: letterText,
        senderName: fullName,
        brokerId: `bureau-${selectedBureau.id}`,
        brokerName: selectedBureau.name,
        brokerDomain: selectedBureau.domain,
        bccSelf,
      });
      setLocalReceipts((prev) => ({ ...prev, [selectedBureau.id]: res.messageId }));
      onUpdateBureauProgress?.(selectedBureau.id, {
        emailSentReceipt: res.messageId,
      });
      setConfirmSend(false);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send compliance email.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8">
      <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-400 tabular-nums">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-amber-400 font-semibold flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> FCRA Bureaus, Payroll, Telco &amp; Marketing Registries
            </span>
            <span aria-hidden="true">·</span>
            <span>{BUREAU_GUIDES.length} Clearinghouses</span>
          </div>
          <span className="text-emerald-400 font-semibold">
            {completedFreezesCount} / {BUREAU_GUIDES.length} Freezes Completed
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
          Specialty Bureaus, Telco CNAM &amp; Marketing Suppression Hub
        </h1>
        <p className="text-sm text-slate-400 max-w-3xl leading-relaxed">
          Lock down Tier-1 FCRA consumer bureaus (LexisNexis, CoreLogic, ChexSystems, Innovis, NCTUE), freeze Equifax payroll records (The Work Number), suppress wireless Caller-ID / Do Not Call feeds, and cut postal list-broker resale.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-4 space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
            Select Clearinghouse or Registry ({BUREAU_GUIDES.length})
          </h2>
          <div className="space-y-2 max-h-[680px] overflow-y-auto pr-1">
            {BUREAU_GUIDES.map((bureau) => {
              const isSelected = bureau.id === selectedBureauId;
              const prog = bureauProgress[bureau.id];
              const sentId = localReceipts[bureau.id] || prog?.emailSentReceipt;
              const frozen = Boolean(prog?.freezePlaced);
              return (
                <button
                  key={bureau.id}
                  onClick={() => handleSelectBureau(bureau.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-slate-900 border-emerald-500/60 text-white shadow-lg shadow-emerald-500/5'
                      : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {frozen ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                      ) : (
                        <Building2
                          className={`w-4 h-4 shrink-0 ${
                            isSelected ? 'text-emerald-400' : 'text-slate-400'
                          }`}
                        />
                      )}
                      <span className="text-xs font-bold truncate">{bureau.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono truncate">
                      <span className="truncate">{bureau.category}</span>
                      {(sentId || frozen) && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-400 font-semibold shrink-0">
                            {frozen ? 'Frozen' : 'Email Sent'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 shrink-0 ${
                      isSelected ? 'text-emerald-400' : 'text-slate-600'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-2xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-slate-800">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400">
                  <span className="text-emerald-400 font-semibold">{selectedBureau.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedBureau.domain}</span>
                </div>
                <h2 className="text-2xl font-bold text-white">{selectedBureau.name}</h2>
                <p className="text-xs text-slate-400 leading-relaxed">{selectedBureau.overview}</p>
              </div>

              <a
                href={selectedBureau.portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors self-start shrink-0 whitespace-nowrap"
              >
                <span>Official Portal</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Persistent Completion Tracker Bar */}
            {onUpdateBureauProgress && (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-4 text-xs">
                <span className="font-semibold text-slate-300">
                  Your Local Progress Checklist:
                </span>
                <div className="flex flex-wrap items-center gap-5">
                  <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(progressForSelected?.freezePlaced)}
                      onChange={(e) =>
                        onUpdateBureauProgress(selectedBureau.id, {
                          freezePlaced: e.target.checked,
                        })
                      }
                      className="rounded border-slate-700 bg-slate-900 text-emerald-500 cursor-pointer"
                    />
                    <span>Freeze / Suppression Completed</span>
                  </label>
                  <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(progressForSelected?.pinSaved)}
                      onChange={(e) =>
                        onUpdateBureauProgress(selectedBureau.id, {
                          pinSaved: e.target.checked,
                        })
                      }
                      className="rounded border-slate-700 bg-slate-900 text-emerald-500 cursor-pointer"
                    />
                    <span>Confirmation / Freeze PIN Stored Safely</span>
                  </label>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Verification Requirement
                </span>
                <p className="text-xs text-slate-300 leading-relaxed">{selectedBureau.whyManual}</p>
              </div>

              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                <span className="text-[11px] font-semibold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> Statutory Basis &amp; Timeline
                </span>
                <p className="text-xs text-slate-300">
                  <strong>Statute:</strong> {selectedBureau.statutoryBasis}
                </p>
                <p className="text-xs text-slate-300">
                  <strong>Response Window:</strong> {selectedBureau.timeline}
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3 text-xs">
              <h3 className="font-bold text-white uppercase tracking-wider text-[11px]">
                Official Contact Endpoints
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-300">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Telephone: <strong className="text-white font-mono">{selectedBureau.phone}</strong>
                  </span>
                </div>
                {selectedBureau.complianceEmail && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="truncate">
                      Privacy Desk:{' '}
                      <strong className="text-emerald-300 font-mono">
                        {selectedBureau.complianceEmail}
                      </strong>
                    </span>
                  </div>
                )}
                <div className="flex items-start gap-2 sm:col-span-2">
                  <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="leading-snug">{selectedBureau.address}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Step-by-Step Removal &amp; Freeze Workflow
              </h3>
              <ol className="space-y-2.5">
                {selectedBureau.instructions.map((step, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-3 p-3 bg-slate-950/70 rounded-xl border border-slate-800/80 text-xs text-slate-300"
                  >
                    <span className="font-mono font-bold text-emerald-400 shrink-0 tabular-nums">
                      0{idx + 1}.
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span>Pre-Filled Statutory Demand / Reference Sheet</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    {selectedBureau.complianceEmail
                      ? `Send directly to ${selectedBureau.complianceEmail} or copy for certified mail`
                      : `Print and mail or follow direct portal steps for ${selectedBureau.name}`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {copiedLetter ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedLetter ? 'Copied' : 'Copy Notice'}</span>
                  </button>

                  {selectedBureau.complianceEmail && (
                    isDirectSendConnected ? (
                      !confirmSend && (
                        <button
                          type="button"
                          onClick={() => setConfirmSend(true)}
                          className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>
                            {currentReceipt ? 'Re-Send via Connected Email' : 'Send via Connected Email'}
                          </span>
                        </button>
                      )
                    ) : (
                      onOpenConnectEmail && (
                        <button
                          type="button"
                          onClick={onOpenConnectEmail}
                          className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          <span>Connect Email to Send</span>
                        </button>
                      )
                    )
                  )}
                </div>
              </div>

              {currentReceipt && (
                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Sent from <strong>{activeConnectedEmail || 'Connected Email'}</strong> to{' '}
                    <strong>{selectedBureau.complianceEmail}</strong> · Receipt:{' '}
                    <span className="font-mono">{currentReceipt}</span>
                  </span>
                </div>
              )}

              {sendError && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{sendError}</span>
                </div>
              )}

              {confirmSend && selectedBureau.complianceEmail && isDirectSendConnected && (
                <div className="p-4 bg-slate-950 border border-emerald-500/40 rounded-xl space-y-3 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <span className="text-slate-200">
                      Confirm sending this statutory notice from{' '}
                      <strong className="text-emerald-400 font-mono">{activeConnectedEmail}</strong> to{' '}
                      <strong className="font-mono">{selectedBureau.complianceEmail}</strong>?
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setConfirmSend(false)}
                        disabled={isSending}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSendBureauEmail}
                        disabled={isSending}
                        className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        {isSending ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>{isSending ? 'Sending...' : 'Confirm & Send'}</span>
                      </button>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer pt-2 border-t border-slate-800/80">
                    <input
                      type="checkbox"
                      checked={bccSelf}
                      onChange={(e) => setBccSelf(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0 cursor-pointer"
                    />
                    <span>
                      Send a BCC copy to my own inbox (<span className="font-mono">{activeConnectedEmail}</span>)
                    </span>
                  </label>
                </div>
              )}

              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap max-h-56 overflow-y-auto leading-relaxed select-text">
                {letterText}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
