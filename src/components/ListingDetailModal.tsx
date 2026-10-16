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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative my-8">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-800">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              {broker.category}
            </span>
            <h2 className="text-xl font-bold text-white mt-1.5">{broker.name} Listing Dossier</h2>
            <p className="text-xs text-slate-500 font-mono">{broker.domain}</p>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Evidence & Confidence Banner */}
        <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium">Evidence Grounding Basis:</span>
            <span className="text-emerald-400 font-semibold">{listing.matchConfidence}</span>
          </div>
          <p className="text-slate-300">{listing.evidenceBasis || 'Verified public directory match.'}</p>
          {listing.crossStateEvidence && (
            <p className="text-amber-400 font-semibold">{listing.crossStateEvidence}</p>
          )}
        </div>

        {/* Leaked Attributes */}
        <div className="space-y-2 text-xs">
          <span className="font-semibold text-slate-400 block uppercase tracking-wider text-[11px]">
            Indexed Attributes On File:
          </span>
          <div className="grid grid-cols-2 gap-2 text-slate-300">
            <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-500 text-[10px] block">Full Name:</span>
              <strong className="text-white">{listing.fullName}</strong>
            </div>
            <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-500 text-[10px] block">Approximate Age:</span>
              <strong className="text-white">{listing.age} years old</strong>
            </div>
            <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-500 text-[10px] block">Locations:</span>
              <strong className="text-white truncate block">{listing.locations.join('; ')}</strong>
            </div>
            <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-500 text-[10px] block">Phones:</span>
              <strong className="text-white truncate block">{listing.phones.join(', ')}</strong>
            </div>
          </div>
        </div>

        {/* Verified Links to Findings on Regular Web */}
        <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2 text-xs">
          <span className="font-semibold text-white block uppercase tracking-wider text-[11px]">
            Live Public Record Links:
          </span>
          <a
            href={searchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-between text-sky-400 hover:text-sky-300 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              <span>Inspect Listing on {broker.name} ({broker.domain})</span>
            </span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <a
            href={broker.optOutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-between text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <span className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4" />
              <span>Official Statutory Opt-Out Procedure</span>
            </span>
            <span className="text-slate-500 font-mono text-[11px]">{broker.removalTime}</span>
          </a>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
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
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
          >
            Submit Opt-Out Request
          </button>
        </div>
      </div>
    </div>
  );
};
