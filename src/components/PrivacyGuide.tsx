import React, { useMemo } from 'react';
import {
  Scale,
  Lock,
  Globe,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';

interface NavigatorWithPrivacy extends Navigator {
  globalPrivacyControl?: boolean;
}

interface PrivacyGuideProps {
  onOpenFirewall?: (subTab: 'records' | 'canary' | 'hygiene') => void;
}

export const PrivacyGuide: React.FC<PrivacyGuideProps> = ({ onOpenFirewall }) => {
  const gpcStatus = useMemo(() => {
    if (typeof navigator === 'undefined') {
      return { gpcActive: false, dntActive: false };
    }
    const nav = navigator as NavigatorWithPrivacy;
    return {
      gpcActive: Boolean(nav.globalPrivacyControl),
      dntActive: nav.doNotTrack === '1' || nav.doNotTrack === 'yes',
    };
  }, []);

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-8 text-xs text-slate-300">
      <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
        <div className="text-xs font-mono text-emerald-400 font-semibold">
          Statutory Rights · Browser GPC Signal · Anti-Re-Exposure Hardening
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
          Consumer Privacy Statutes &amp; Permanent Suppression Playbook
        </h1>
        <p className="text-sm text-slate-400 max-w-3xl leading-relaxed">
          Combine statutory deletion notices with universal browser opt-out signals (Sec-GPC: 1) and upstream public-record minimization so scrubbed broker dossiers do not re-populate.
        </p>
      </div>

      {/* Live Browser Global Privacy Control (Sec-GPC: 1) Diagnostic */}
      <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <span>Live Browser Global Privacy Control (Sec-GPC: 1) Diagnostic</span>
            </h2>
            <p className="text-slate-400">
              Under CPRA (Cal. Civ. Code § 1798.135), Colorado CPA, Connecticut CTDPA, and Texas TDPSA, businesses and data brokers are legally required to honor `Sec-GPC: 1` as a binding Opt-Out of Sale/Sharing.
            </p>
          </div>

          <div
            className={`px-4 py-2 rounded-xl border font-mono font-bold flex items-center gap-2 shrink-0 whitespace-nowrap ${
              gpcStatus.gpcActive
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}
          >
            {gpcStatus.gpcActive ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>GPC ACTIVE (navigator.globalPrivacyControl = true)</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>GPC NOT ENABLED IN THIS BROWSER</span>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
            <div className="font-bold text-white">Brave &amp; DuckDuckGo Browsers</div>
            <p className="text-slate-400 leading-relaxed">
              Transmit `Sec-GPC: 1` and `navigator.globalPrivacyControl = true` automatically by default on every HTTP request.
            </p>
          </div>
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
            <div className="font-bold text-white">Mozilla Firefox</div>
            <p className="text-slate-400 leading-relaxed">
              Open Settings → Privacy &amp; Security → Website Privacy Preferences and check "Tell websites not to sell or share my data".
            </p>
          </div>
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
            <div className="font-bold text-white">Chrome / Safari / Edge</div>
            <p className="text-slate-400 leading-relaxed">
              Install EFF Privacy Badger or OptMeowt to broadcast `Sec-GPC: 1` to ad-tech exchanges and broker pixels.{' '}
              <a
                href="https://globalprivacycontrol.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:underline inline-flex items-center gap-1"
              >
                <span>Official GPC Spec</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Statutory Framework Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
            <Scale className="w-4 h-4" />
            California CCPA / CPRA &amp; Delete Act (SB 362)
          </div>
          <p className="leading-relaxed text-slate-400">
            Cal. Civ. Code § 1798.105 grants consumers the unequivocal right to demand deletion of personal information held by businesses and data brokers, while § 1798.120 guarantees the right to opt out of sale or sharing. SB 362 subjects registered data brokers to recurring 45-day deletion mandates and CPPA administrative fines.
          </p>
          <ul className="space-y-1.5 list-disc list-inside text-slate-300 text-[11px]">
            <li>Mandatory compliance deadline: 45 calendar days from verified receipt.</li>
            <li>Requires brokers to cascade deletions to downstream service providers and buyers.</li>
          </ul>
        </div>

        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
          <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
            <Globe className="w-4 h-4" />
            Texas TDPSA &amp; US State Omnibus Privacy Laws
          </div>
          <p className="leading-relaxed text-slate-400">
            Tex. Bus. &amp; Com. Code § 541 (TDPSA), Virginia VCDPA, Colorado CPA, Connecticut CTDPA, Oregon OCPA, New Jersey NJDPA, and 15+ state omnibus statutes mandate deletion of personal data obtained FROM or ABOUT the consumer—closing the legacy "publicly obtained data" loophole.
          </p>
          <ul className="space-y-1.5 list-disc list-inside text-slate-300 text-[11px]">
            <li>Strict opt-out of targeted advertising, sale of PII, and high-risk profiling.</li>
            <li>Enforceable through State Attorneys General with civil statutory penalties up to $7,500–$20,000 per violation.</li>
          </ul>
        </div>

        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <Lock className="w-4 h-4" />
            Fair Credit Reporting Act (FCRA § 605A / § 609) &amp; DPPA
          </div>
          <p className="leading-relaxed text-slate-400">
            Regulates specialty consumer reporting agencies (LexisNexis, CoreLogic, ChexSystems, Innovis, NCTUE, The Work Number, MIB). Guarantees free security freezes (15 U.S.C. § 1681c-1), annual file disclosures, and restrictions on DMV motor vehicle record resale under the Driver’s Privacy Protection Act (18 U.S.C. § 2721).
          </p>
        </div>

        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
          <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
            <FileText className="w-4 h-4" />
            Limited Power of Attorney (Authorized Agent Model)
          </div>
          <p className="leading-relaxed text-slate-400">
            Under CCPA § 1798.130 and Cal. Code Regs. tit. 11 § 7063, consumers may legally designate an authorized representative via signed written permission to transmit statutory opt-out and deletion demands, prohibiting brokers from imposing discriminatory verification hurdles.
          </p>
        </div>
      </div>

      {/* Upstream Anti-Re-Exposure Hardening Playbook */}
      <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">
            Upstream Data Minimization: Stopping Brokers From Re-Ingesting Your Identity
          </h2>
          {onOpenFirewall && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onOpenFirewall('records')}
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold cursor-pointer whitespace-nowrap"
              >
                Open Public Records Petitions
              </button>
              <button
                type="button"
                onClick={() => onOpenFirewall('canary')}
                className="px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-emerald-300 font-semibold cursor-pointer whitespace-nowrap"
              >
                Mint Canary Aliases
              </button>
              <button
                type="button"
                onClick={() => onOpenFirewall('hygiene')}
                className="px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-sky-300 font-semibold cursor-pointer whitespace-nowrap"
              >
                ID Redactor &amp; EXIF Lab
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
            <div className="font-bold text-emerald-400">1. Compartment Email &amp; VoIP Phone Aliases</div>
            <p className="text-slate-400 leading-relaxed">
              Never give your primary carrier phone number or primary email to retail loyalty programs, sweepstakes, or warranty forms. Use unique email aliases and a secondary VoIP number for commercial signups—retail loyalty networks are the #1 commercial source feeding people-search brokers.
            </p>
          </div>
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
            <div className="font-bold text-emerald-400">2. USPS Change-of-Address &amp; Voter Roll Protections</div>
            <p className="text-slate-400 leading-relaxed">
              USPS NCOA (National Change of Address) commercial feeds propagate moves to list brokers within 30 days. When moving, use a P.O. Box or PMB as your mailing address where permitted, and check state Safe at Home / Confidential Voter Registration eligibility if at heightened safety risk.
            </p>
          </div>
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
            <div className="font-bold text-emerald-400">3. County Recorder &amp; Property Assessor Privacy Trusts</div>
            <p className="text-slate-400 leading-relaxed">
              County property deeds and tax rolls are public record in most states. Holding residential title through a non-eponymous revocable living trust or LLC (rather than your full legal name) prevents automated county deed scrapers from publishing your home address.
            </p>
          </div>
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
            <div className="font-bold text-emerald-400">4. State DMV Marketing &amp; DPPA Blocks</div>
            <p className="text-slate-400 leading-relaxed">
              Verify your state DMV privacy election so vehicle registration and title renewals are blocked from bulk commercial licensing under state DPPA opt-in/opt-out rules.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
