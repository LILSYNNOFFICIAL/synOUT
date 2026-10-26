import React from 'react';
import { ScanResult, UserProfile } from '../types';
import { X, Phone, MapPin, Users, Scale, ShieldAlert, Check, ArrowRight, CreditCard, Briefcase } from 'lucide-react';

interface ExposureVectorModalProps {
  results: ScanResult[];
  profile: UserProfile;
  onClose: () => void;
  onNavigateToTracker: () => void;
}

export const ExposureVectorModal: React.FC<ExposureVectorModalProps> = ({
  results,
  profile,
  onClose,
  onNavigateToTracker,
}) => {
  const exposed = results.filter((r) => r.status === 'exposed');
  
  // Calculate vector stats
  const phoneBrokers = exposed.filter((r) => 
    r.mockListingData.leakTypes.some((t) => t.toLowerCase().includes('phone') || t.toLowerCase().includes('mobile') || t.toLowerCase().includes('landline'))
  );

  const addressBrokers = exposed.filter((r) =>
    r.mockListingData.leakTypes.some((t) => t.toLowerCase().includes('address') || t.toLowerCase().includes('residence') || t.toLowerCase().includes('property') || t.toLowerCase().includes('satellite'))
  );

  const familyBrokers = exposed.filter((r) =>
    r.mockListingData.leakTypes.some((t) => t.toLowerCase().includes('relative') || t.toLowerCase().includes('family') || t.toLowerCase().includes('in-law') || t.toLowerCase().includes('associate'))
  );

  const courtBrokers = exposed.filter((r) =>
    r.mockListingData.leakTypes.some((t) => t.toLowerCase().includes('court') || t.toLowerCase().includes('criminal') || t.toLowerCase().includes('voter') || t.toLowerCase().includes('traffic') || t.toLowerCase().includes('arrest'))
  );

  const financialBrokers = exposed.filter((r) =>
    r.mockListingData.leakTypes.some((t) => t.toLowerCase().includes('credit') || t.toLowerCase().includes('wealth') || t.toLowerCase().includes('salary') || t.toLowerCase().includes('prescreen'))
  );

  const marketingBrokers = exposed.filter((r) =>
    r.mockListingData.leakTypes.some((t) => t.toLowerCase().includes('market') || t.toLowerCase().includes('habit') || t.toLowerCase().includes('b2b') || t.toLowerCase().includes('commercial'))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/75 backdrop-blur-md overflow-y-auto">
      <div className="glass-popover rounded-2xl w-full max-w-4xl overflow-hidden relative my-8">
        {/* Header */}
        <div className="p-6 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Privacy Risk Vector Breakdown</h3>
              <p className="text-xs text-slate-400">
                Categorized threat analysis of personal records leaked across public directories
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8 space-y-6 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Vector 1: Telecommunications & Phone */}
            <div className="glass-card rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-bold text-white text-sm">Direct Phone Numbers</span>
                </div>
                <span className="text-xs font-mono font-bold text-rose-400 tabular-nums shrink-0">
                  {phoneBrokers.length} Brokers Leaking
                </span>
              </div>

              <p className="text-xs text-slate-300/90 leading-relaxed">
                Exposing mobile numbers enables automated SMS smishing, robocalls, and reverse phone stalking. Data brokers link your wireless provider, carrier type, and unlisted status.
              </p>

              <div className="pt-3 border-t border-white/[0.07] text-[11px] space-y-1">
                <div className="font-semibold text-slate-200">Action Plan</div>
                <div className="text-slate-400 leading-relaxed">
                  Submit opt-outs to TruePeopleSearch, USPhoneBook, and Addresses.com · Register numbers with the FTC National Do Not Call Registry.
                </div>
              </div>
            </div>

            {/* Vector 2: Physical Address & Satellite Maps */}
            <div className="glass-card rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4 text-sky-400 shrink-0" />
                  <span className="font-bold text-white text-sm">Home &amp; Prior Addresses</span>
                </div>
                <span className="text-xs font-mono font-bold text-rose-400 tabular-nums shrink-0">
                  {addressBrokers.length} Brokers Leaking
                </span>
              </div>

              <p className="text-xs text-slate-300/90 leading-relaxed">
                Physical addresses allow anyone to view your home exterior via satellite imagery, assess your estimated home value, mortgage lender, and property tax history.
              </p>

              <div className="pt-3 border-t border-white/[0.07] text-[11px] space-y-1">
                <div className="font-semibold text-slate-200">Action Plan</div>
                <div className="text-slate-400 leading-relaxed">
                  Suppress listings on ClustrMaps, Whitepages, and BlockShopper · Request county deed redaction where state safety laws apply.
                </div>
              </div>
            </div>

            {/* Vector 3: Family Members & Known Associates */}
            <div className="glass-card rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="font-bold text-white text-sm">Living Family Tree</span>
                </div>
                <span className="text-xs font-mono font-bold text-rose-400 tabular-nums shrink-0">
                  {familyBrokers.length} Brokers Leaking
                </span>
              </div>

              <p className="text-xs text-slate-300/90 leading-relaxed">
                Genealogy and people search directories connect living relatives, maiden names, and in-laws, making social engineering and impersonation scams easy for attackers.
              </p>

              <div className="pt-3 border-t border-white/[0.07] text-[11px] space-y-1">
                <div className="font-semibold text-slate-200">Action Plan</div>
                <div className="text-slate-400 leading-relaxed">
                  Purge profiles from FamilyTreeNow, CyberBackgroundChecks, and Radaris · Have close family members run matching suppression scans.
                </div>
              </div>
            </div>

            {/* Vector 4: Civil & Public Court Aggregators */}
            <div className="glass-card rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Scale className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="font-bold text-white text-sm">Court &amp; Voter Records</span>
                </div>
                <span className="text-xs font-mono font-bold text-rose-400 tabular-nums shrink-0">
                  {courtBrokers.length} Brokers Leaking
                </span>
              </div>

              <p className="text-xs text-slate-300/90 leading-relaxed">
                Background search companies republish civil judgments, minor traffic violations, voter political party registrations, and commercial credit scores to public visitors.
              </p>

              <div className="pt-3 border-t border-white/[0.07] text-[11px] space-y-1">
                <div className="font-semibold text-slate-200">Action Plan</div>
                <div className="text-slate-400 leading-relaxed">
                  Demand complete record suppression from BeenVerified and MyLife · Submit formal deletion demands under state CCPA/CPRA statutes.
                </div>
              </div>
            </div>

            {/* Vector 5: Financial & Credit Marketing */}
            <div className="glass-card rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <CreditCard className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-bold text-white text-sm">Credit &amp; Pre-Screen Feeds</span>
                </div>
                <span className="text-xs font-mono font-bold text-amber-400 tabular-nums shrink-0">
                  {financialBrokers.length} Aggregators
                </span>
              </div>

              <p className="text-xs text-slate-300/90 leading-relaxed">
                Credit bureaus and subprime marketing networks license your address history and credit eligibility ranges to predatory credit card vendors and insurers.
              </p>

              <div className="pt-3 border-t border-white/[0.07] text-[11px] space-y-1">
                <div className="font-semibold text-slate-200">Action Plan</div>
                <div className="text-slate-400 leading-relaxed">
                  Register electronic suppression at OptOutPrescreen.com · Submit statutory Employment Freeze on Equifax The Work Number.
                </div>
              </div>
            </div>

            {/* Vector 6: Commercial & B2B Telemetry */}
            <div className="glass-card rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Briefcase className="w-4 h-4 text-sky-400 shrink-0" />
                  <span className="font-bold text-white text-sm">Corporate &amp; B2B Cold Outreach</span>
                </div>
                <span className="text-xs font-mono font-bold text-sky-400 tabular-nums shrink-0">
                  {marketingBrokers.length} Brokers Leaking
                </span>
              </div>

              <p className="text-xs text-slate-300/90 leading-relaxed">
                B2B brokers scrape corporate contact books and email signatures, selling personal cell phones and work email addresses to commercial sales dialers.
              </p>

              <div className="pt-3 border-t border-white/[0.07] text-[11px] space-y-1">
                <div className="font-semibold text-slate-200">Action Plan</div>
                <div className="text-slate-400 leading-relaxed">
                  Submit profile removal at ZoomInfo, Apollo.io, and Lusha · Suppress corporate identity resolution links via LiveRamp.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-400 tabular-nums">
            Total {exposed.length} sites actively exposing your vectors.
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={() => {
                onClose();
                onNavigateToTracker();
              }}
              className="px-5 py-2.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/20 whitespace-nowrap"
            >
              <span>Manage Removals</span>
              <ArrowRight className="w-4 h-4 text-slate-950" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
