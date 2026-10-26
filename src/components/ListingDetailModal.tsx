import React from 'react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import { getBrokerRecordSearchUrl } from '../utils/scanEngine';
import { 
  X, 
  ExternalLink, 
  ShieldAlert, 
  CheckCircle2, 
  Globe, 
  Clock, 
  Mail, 
  FileText, 
  Phone, 
  MapPin 
} from 'lucide-react';

interface ListingDetailModalProps {
  broker: DataBroker;
  result: ScanResult;
  profile: UserProfile;
  onClose: () => void;
  onAutomatedOptOut: (brokerId: string) => void;
}

export const ListingDetailModal: React.FC<ListingDetailModalProps> = ({
  broker,
  result,
  profile,
  onClose,
  onAutomatedOptOut,
}) => {
  const listing = result.mockListingData;
  const searchUrl = getBrokerRecordSearchUrl(broker, profile);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md overflow-y-auto">
      <div className="glass-popover rounded-2xl max-w-2xl w-full p-6 sm:p-8 space-y-6 relative my-8">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-white/[0.08]">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400">
              <span className="text-emerald-400 font-semibold">{broker.category}</span>
              <span aria-hidden="true">·</span>
              <span>{broker.domain}</span>
            </div>
            <h2 className="text-xl font-bold text-white">{broker.name} Listing Dossier</h2>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Evidence & Confidence Banner */}
        <div className="p-4 glass-subtle rounded-xl space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium">Evidence Grounding Basis:</span>
            <span className="text-emerald-400 font-semibold font-mono">{listing.matchConfidence}</span>
          </div>
          <p className="text-slate-300">{listing.evidenceBasis || 'Verified public directory match.'}</p>
          {listing.crossStateEvidence && (
            <p className="text-amber-400 font-semibold">{listing.crossStateEvidence}</p>
          )}
        </div>

        {/* Leaked Attributes */}
        <div className="space-y-2 text-xs">
          <span className="font-semibold text-slate-300 block">
            Indexed Attributes On File
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 glass-subtle rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-white/[0.07] text-slate-300 tabular-nums">
            <div className="p-3.5 space-y-2 divide-y divide-white/[0.07]">
              <div className="pb-2">
                <span className="text-slate-400 text-[11px] block">Full Name</span>
                <strong className="text-white">{listing.fullName}</strong>
              </div>
              <div className="pt-2">
                <span className="text-slate-400 text-[11px] block">Locations</span>
                <strong className="text-white truncate block">{listing.locations.join('; ')}</strong>
              </div>
            </div>
            <div className="p-3.5 space-y-2 divide-y divide-white/[0.07]">
              <div className="pb-2">
                <span className="text-slate-400 text-[11px] block">Approximate Age</span>
                <strong className="text-white">{listing.age} years old</strong>
              </div>
              <div className="pt-2">
                <span className="text-slate-400 text-[11px] block">Phones</span>
                <strong className="text-white font-mono truncate block">{listing.phones.join(', ')}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Verified Links to Findings on Regular Web */}
        <div className="space-y-2 text-xs">
          <span className="font-semibold text-slate-300 block">
            Live Public Record Links
          </span>
          <div className="glass-subtle rounded-xl divide-y divide-white/[0.07]">
            <a
              href={searchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full p-3.5 flex items-center justify-between text-sky-400 hover:text-sky-300 hover:bg-white/[0.04] transition-colors"
            >
              <span className="flex items-center gap-2">
                <Globe className="w-4 h-4 shrink-0" />
                <span>Inspect Listing on {broker.name} ({broker.domain})</span>
              </span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>

            <a
              href={broker.optOutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full p-3.5 flex items-center justify-between text-emerald-400 hover:text-emerald-300 hover:bg-white/[0.04] transition-colors"
            >
              <span className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4 shrink-0" />
                <span>Official Statutory Opt-Out Procedure</span>
              </span>
              <span className="text-slate-400 font-mono text-[11px] tabular-nums">{broker.removalTime}</span>
            </a>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.08]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={() => {
              onAutomatedOptOut(broker.id);
              onClose();
            }}
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all cursor-pointer whitespace-nowrap"
          >
            Submit Opt-Out Request
          </button>
        </div>
      </div>
    </div>
  );
};
