import React from 'react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import { getBrokerRecordSearchUrl } from '../utils/scanEngine';
import {
  X,
  ExternalLink,
  Globe,
  Mail,
  Bot,
} from 'lucide-react';

interface ListingDetailModalProps {
  broker: DataBroker;
  result: ScanResult;
  profile: UserProfile;
  onClose: () => void;
  onAutomatedOptOut: (brokerId: string) => void;
  onOpenAutomatedNavigator?: (broker: DataBroker, result: ScanResult) => void;
  onOpenWebFormWorkbench?: (broker: DataBroker) => void;
}

export const ListingDetailModal: React.FC<ListingDetailModalProps> = ({
  broker,
  result,
  profile,
  onClose,
  onAutomatedOptOut,
  onOpenAutomatedNavigator,
  onOpenWebFormWorkbench,
}) => {
  const listing = result.mockListingData;
  const searchUrl = getBrokerRecordSearchUrl(broker, profile);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="glass-popover rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 relative my-8">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-white/[0.08]">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400">
              <span className="text-emerald-400 font-semibold">{broker.category}</span>
              <span aria-hidden="true">·</span>
              <span>{broker.domain}</span>
              <span aria-hidden="true">·</span>
              <span>{broker.removalMethod}</span>
            </div>
            <h2 className="text-xl font-bold text-white">{broker.name} Listing Details</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Evidence & Confidence Banner */}
        <div className="p-4 glass-subtle rounded-2xl space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium">Match Basis:</span>
            <span className="text-emerald-400 font-semibold font-mono">
              {listing.matchConfidence.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-slate-300 leading-relaxed">
            {listing.evidenceBasis || 'Verified public directory match.'}
          </p>
          {listing.crossStateEvidence && (
            <p className="text-amber-300 font-medium">{listing.crossStateEvidence}</p>
          )}
        </div>

        {/* Leaked Attributes */}
        <div className="space-y-2 text-xs">
          <span className="font-semibold text-slate-300 block">
            Personal Details Exposed On File
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 glass-subtle rounded-2xl divide-y sm:divide-y-0 sm:divide-x divide-white/[0.07] text-slate-300 tabular-nums">
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
                <strong className="text-white font-mono truncate block">
                  {listing.phones.join(', ') || 'None listed'}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Verified Links to Findings on Regular Web */}
        <div className="space-y-2 text-xs">
          <span className="font-semibold text-slate-300 block">
            Public Record &amp; Official Opt-Out Links
          </span>
          <div className="glass-subtle rounded-2xl divide-y divide-white/[0.07]">
            <a
              href={searchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full p-3.5 flex items-center justify-between text-sky-400 hover:text-sky-300 hover:bg-white/[0.04] transition-colors"
            >
              <span className="flex items-center gap-2">
                <Globe className="w-4 h-4 shrink-0" />
                <span>Inspect Public Listing on {broker.name} ({broker.domain})</span>
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
                <span>Official Opt-Out Page ({broker.domain})</span>
              </span>
              <span className="text-slate-400 font-mono text-[11px] tabular-nums">
                {broker.removalTime}
              </span>
            </a>
          </div>
        </div>

        {/* Side-by-Side Automated Removal Choices: Online Form vs Legal Email */}
        <div className="space-y-2.5 text-xs">
          <span className="font-semibold text-slate-200 block">
            Choose How synOUT Removes This Record For You
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(onOpenAutomatedNavigator || onOpenWebFormWorkbench) && (
              <div className="glass-subtle rounded-2xl p-4 flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-bold text-white flex items-center gap-2">
                    <Bot className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>1. Online Form (Done For You)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Opens {broker.name}&apos;s opt-out form, fills your info, checks required consent
                    &amp; &ldquo;Do Not Sell&rdquo; boxes for you, and submits.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onOpenAutomatedNavigator) {
                      onOpenAutomatedNavigator(broker, result);
                    } else if (onOpenWebFormWorkbench) {
                      onOpenWebFormWorkbench(broker);
                    }
                  }}
                  className="w-full px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>Auto-Fill &amp; Submit Form</span>
                </button>
              </div>
            )}

            <div className="glass-subtle rounded-2xl p-4 flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <div className="font-bold text-white flex items-center gap-2">
                  <Mail className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>2. Legal Email (Sent For You)</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Writes a formal privacy deletion demand and sends it directly to{' '}
                  <span className="font-mono text-slate-300">
                    {broker.privacyEmail || `privacy@${broker.domain}`}
                  </span>
                  .
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onAutomatedOptOut(broker.id);
                  onClose();
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Send Legal Removal Email</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Close */}
        <div className="flex items-center justify-end pt-2 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
