import React, { useState } from 'react';
import { UserProfile } from '../types';
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
  Lock
} from 'lucide-react';

interface ManualVerificationGuidesProps {
  profile: UserProfile;
}

interface BureauGuide {
  id: string;
  name: string;
  category: 'Public Record Clearinghouse' | 'Specialty Consumer Bureau' | 'Pre-Screen Marketing Bureau';
  overview: string;
  whyManual: string;
  phone: string;
  address: string;
  portalUrl: string;
  statutoryBasis: string;
  timeline: string;
  requiredDocuments: string[];
  instructions: string[];
  letterTemplate: (profile: UserProfile) => string;
}

const BUREAU_GUIDES: BureauGuide[] = [
  {
    id: 'lexisnexis',
    name: 'LexisNexis Consumer Center',
    category: 'Public Record Clearinghouse',
    overview: 'The largest consumer intelligence and background data clearinghouse in North America.',
    whyManual: 'LexisNexis requires formal identity verification and compliance with specific statutory exemptions under DPPA, GLBA, or state privacy laws.',
    phone: '1-888-497-0011',
    address: 'LexisNexis Risk Solutions Consumer Center, P.O. Box 105108, Atlanta, GA 30348-5108',
    portalUrl: 'https://optout.lexisnexis.com/',
    statutoryBasis: 'Driver’s Privacy Protection Act (DPPA) & Fair Credit Reporting Act (FCRA § 609)',
    timeline: '30 Calendar Days',
    requiredDocuments: [
      'Copy of government-issued Photo ID',
      'Proof of current physical address (utility bill within 90 days)',
      'Signed consumer verification declaration'
    ],
    instructions: [
      'Navigate to the official LexisNexis Opt-Out portal using the link below.',
      'Select your suppression justification (Statutory Privacy Rights or Identity Protection).',
      'Enter identifying details and submit online.',
      'Check postal mail for the confirmation PIN letter sent within 14 days.'
    ],
    letterTemplate: (p) => 
`DATE: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
TO: LexisNexis Risk Solutions Consumer Center
P.O. Box 105108, Atlanta, GA 30348-5108

RE: FORMAL DEMAND FOR CONSUMER DISCLOSURE & SUPPRESSION (FCRA & CCPA)

Consumer: ${p.firstName} ${p.lastName}
Address: ${p.currentCity}, ${p.currentState}

Under applicable privacy statutes, I demand complete suppression of my records from public directory lookup products.

Sincerely,
${p.firstName} ${p.lastName}`
  },
  {
    id: 'chexsystems',
    name: 'ChexSystems Consumer Relations',
    category: 'Specialty Consumer Bureau',
    overview: 'Specialty consumer reporting agency tracking retail banking history and checking accounts.',
    whyManual: 'Governed by FCRA; mandates strict consumer authentication to prevent misattributing banking records.',
    phone: '1-800-428-9623',
    address: 'Chex Systems, Inc., Attn: Consumer Relations, 7805 Hudson Road, Suite 100, Woodbury, MN 55125',
    portalUrl: 'https://www.chexsystems.com/web/chexsystems/consumernav/page/securityfreeze/',
    statutoryBasis: 'Fair Credit Reporting Act (15 U.S.C. § 1681c-1)',
    timeline: '5-15 Business Days',
    requiredDocuments: ['SSN last 4 digits', 'Current and prior 5-year address trail'],
    instructions: [
      'Visit ChexSystems Security Freeze & Opt-Out portal.',
      'Authenticate identity through verification questions.',
      'Place a Security Freeze on your banking consumer report.'
    ],
    letterTemplate: (p) =>
`DATE: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
TO: Chex Systems, Inc., Attn: Consumer Relations
7805 Hudson Road, Suite 100, Woodbury, MN 55125

RE: CONSUMER DISCLOSURE AND SECURITY SUPPRESSION

Consumer: ${p.firstName} ${p.lastName} (${p.currentCity}, ${p.currentState})
Please place a security freeze on my file and confirm marketing opt-out.`
  },
  {
    id: 'innovis',
    name: 'Innovis Consumer Assistance',
    category: 'Specialty Consumer Bureau',
    overview: 'The secondary national credit and consumer reporting agency.',
    whyManual: 'Requires identity matching against credit and public registry bureau files to generate a secure consumer PIN.',
    phone: '1-800-540-2505',
    address: 'Innovis Consumer Assistance, P.O. Box 530088, Atlanta, GA 30353',
    portalUrl: 'https://www.innovis.com/personal/optOut',
    statutoryBasis: 'FCRA § 604 & Consumer Privacy Opt-Out Regulations',
    timeline: 'Immediate Online (3-5 days mail)',
    requiredDocuments: ['Full legal name and address history'],
    instructions: [
      'Open Innovis Opt-Out web portal.',
      'Select Permanent Opt-Out of Pre-approved Credit and Insurance Offers.',
      'Complete the secure submission form.'
    ],
    letterTemplate: (p) =>
`DATE: ${new Date().toLocaleDateString()}
TO: Innovis Consumer Assistance, P.O. Box 530088, Atlanta, GA 30353
RE: PERMANENT OPT-OUT NOTICE (FCRA § 604)

Consumer: ${p.firstName} ${p.lastName} (${p.currentCity}, ${p.currentState})`
  },
  {
    id: 'corelogic',
    name: 'CoreLogic Credco',
    category: 'Public Record Clearinghouse',
    overview: 'Gathers municipal court filings, real property ownership, deed transfers, and tax assessments.',
    whyManual: 'Property records are tied to county recorder registries; requires specific property validation.',
    phone: '1-800-637-2422',
    address: 'CoreLogic Credco, Consumer Relations, P.O. Box 509124, San Diego, CA 92150',
    portalUrl: 'https://www.corelogic.com/consumer-relations/',
    statutoryBasis: 'Fair Credit Reporting Act & State Public Record Suppression Statutes',
    timeline: '15-30 Calendar Days',
    requiredDocuments: ['Proof of residency at current property'],
    instructions: [
      'Call CoreLogic Consumer Relations or access their consumer portal.',
      'Request your Consumer Disclosure File under FCRA.',
      'Submit written suppression request.'
    ],
    letterTemplate: (p) =>
`DATE: ${new Date().toLocaleDateString()}
TO: CoreLogic Credco, P.O. Box 509124, San Diego, CA 92150
RE: CONSUMER FILE DISCLOSURE & SUPPRESSION

Consumer: ${p.firstName} ${p.lastName} (${p.currentCity}, ${p.currentState})`
  },
  {
    id: 'optoutprescreen',
    name: 'OptOutPrescreen (Equifax, Experian, TransUnion, Innovis)',
    category: 'Pre-Screen Marketing Bureau',
    overview: 'The official credit reporting industry website to opt-out of firm offers of credit or insurance.',
    whyManual: 'Permanent opt-out requires signing and mailing an official Permanent Opt-Out Election Form.',
    phone: '1-888-567-8688',
    address: 'Opt-Out Request, P.O. Box 505, Woodbury, NY 11797',
    portalUrl: 'https://www.optoutprescreen.com/',
    statutoryBasis: 'Fair Credit Reporting Act (15 U.S.C. § 1681b)',
    timeline: 'Immediate for 5-Year (Permanent upon signed mail election)',
    requiredDocuments: ['Legal name and SSN last 4 for verification'],
    instructions: [
      'Access OptOutPrescreen.com via the link below.',
      'Select Electronic Opt-Out (5 years) or Permanent Opt-Out Election form.',
      'For permanent removal: sign and mail the generated document.'
    ],
    letterTemplate: (p) =>
`DATE: ${new Date().toLocaleDateString()}
TO: OptOutPrescreen Consumer Processing, P.O. Box 505, Woodbury, NY 11797
RE: NOTICE OF PERMANENT OPT-OUT ELECTION

Consumer: ${p.firstName} ${p.lastName} (${p.currentCity}, ${p.currentState})`
  }
];

export const ManualVerificationGuides: React.FC<ManualVerificationGuidesProps> = ({ profile }) => {
  const [selectedBureauId, setSelectedBureauId] = useState<string>(BUREAU_GUIDES[0].id);
  const [copiedLetter, setCopiedLetter] = useState(false);

  const selectedBureau = BUREAU_GUIDES.find((b) => b.id === selectedBureauId) || BUREAU_GUIDES[0];
  const letterText = selectedBureau.letterTemplate(profile);

  const handleCopy = () => {
    navigator.clipboard.writeText(letterText);
    setCopiedLetter(true);
    setTimeout(() => setCopiedLetter(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8">
      <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> High-Verification Tier
            </span>
            <span className="text-xs text-slate-400">LexisNexis, ChexSystems, Innovis, CoreLogic</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            Specialized Clearinghouse & Bureau Removal Guides
          </h1>
          <p className="text-sm text-slate-400 max-w-3xl">
            Tier-1 consumer reporting agencies maintain municipal and financial dossiers that require formal identity verification and PIN procedures.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2">
            Select Specialty Clearinghouse
          </h2>
          <div className="space-y-2">
            {BUREAU_GUIDES.map((bureau) => {
              const isSelected = bureau.id === selectedBureauId;
              return (
                <button
                  key={bureau.id}
                  onClick={() => setSelectedBureauId(bureau.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-white shadow-lg shadow-emerald-500/5'
                      : 'bg-slate-900 hover:bg-slate-800/80 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-emerald-400' : 'text-slate-400'}`} />
                      <span className="text-sm font-bold truncate">{bureau.name}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 block truncate">{bureau.category}</span>
                  </div>
                  <ChevronRight className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-emerald-400' : 'text-slate-600'}`} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-3xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {selectedBureau.category}
                </span>
                <h2 className="text-2xl font-bold text-white mt-2">{selectedBureau.name}</h2>
                <p className="text-xs text-slate-400 mt-1">{selectedBureau.overview}</p>
              </div>

              <a
                href={selectedBureau.portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all self-start sm:self-auto cursor-pointer"
              >
                Official Verification Portal
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-1.5">
                <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Why Manual Action Is Required
                </span>
                <p className="text-xs text-slate-300 leading-relaxed">{selectedBureau.whyManual}</p>
              </div>

              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-1.5">
                <span className="text-[11px] font-semibold text-sky-400 uppercase tracking-wider flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Statutory Basis & Timeline
                </span>
                <p className="text-xs text-slate-300">
                  <strong>Statute:</strong> {selectedBureau.statutoryBasis}
                </p>
                <p className="text-xs text-slate-300">
                  <strong>Statutory Response Window:</strong> {selectedBureau.timeline}
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3 text-xs">
              <h3 className="font-bold text-white uppercase tracking-wider text-[11px]">Official Bureau Contact Endpoints</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-300">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Telephone: <strong className="text-white">{selectedBureau.phone}</strong></span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span className="leading-snug">{selectedBureau.address}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Step-by-Step Removal Workflow
              </h3>
              <ol className="space-y-2.5">
                {selectedBureau.instructions.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-3 p-3 bg-slate-950/70 rounded-xl border border-slate-800/80 text-xs text-slate-300">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center flex-shrink-0 text-[11px]">
                      {idx + 1}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    Pre-Filled Written Demand Letter
                  </h3>
                  <p className="text-xs text-slate-400">Formatted for {selectedBureau.name}</p>
                </div>
                <button
                  onClick={handleCopy}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedLetter ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedLetter ? 'Copied' : 'Copy Letter'}
                </button>
              </div>

              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap max-h-56 overflow-y-auto leading-relaxed select-text">
                {letterText}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
