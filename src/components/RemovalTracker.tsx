import React, { useState } from 'react';
import { DATA_BROKERS } from '../data/brokers';
import { DataBroker, ScanResult, UserProfile } from '../types';
import { getBrokerRecordSearchUrl } from '../utils/scanEngine';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink,
  FileText,
  RefreshCw,
  ShieldCheck,
  Calendar,
  Search,
  Globe
} from 'lucide-react';

interface RemovalTrackerProps {
  results: ScanResult[];
  profile: UserProfile;
  onOpenListingModal: (broker: DataBroker, result: ScanResult) => void;
  onOpenLegalNotice: (broker: DataBroker, result: ScanResult) => void;
  onToggleStatus: (brokerId: string) => void;
  onBatchOptOut: () => void;
  onOpenDiyAssistantModal: (broker: DataBroker, result: ScanResult) => void;
}

export const RemovalTracker: React.FC<RemovalTrackerProps> = ({
  results,
  profile,
  onOpenListingModal,
  onOpenLegalNotice,
  onToggleStatus,
  onBatchOptOut,
  onOpenDiyAssistantModal,
}) => {
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'removed'>('all');
  const [search, setSearch] = useState('');

  const trackingItems = results.filter(
    (r) => r.removalStatus === 'submitted' || r.removalStatus === 'removed' || r.status === 'exposed'
  );

  const submittedCount = results.filter((r) => r.removalStatus === 'submitted').length;
  const removedCount = results.filter((r) => r.removalStatus === 'removed').length;
  const pendingCount = results.filter((r) => r.status === 'exposed' && !r.removalStatus).length;

  const filteredItems = trackingItems.filter((item) => {
    const broker = DATA_BROKERS.find((b) => b.id === item.brokerId);
    if (!broker) return false;

    const matchesSearch =
      broker.name.toLowerCase().includes(search.toLowerCase()) ||
      broker.domain.toLowerCase().includes(search.toLowerCase());

    if (filter === 'in_progress') return matchesSearch && item.removalStatus === 'submitted';
    if (filter === 'removed') return matchesSearch && item.removalStatus === 'removed';
    return matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-3xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              Removal & Expungement Lifecycle Tracker
            </h1>
            <p className="text-xs text-slate-400">
              Audits legal statutory response windows (15–45 days) and records suppression across directories.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onBatchOptOut}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              Batch Dispatch Pending
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">In Progress</span>
            <span className="text-2xl font-bold text-sky-400 font-mono">{submittedCount}</span>
          </div>

          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">Confirmed Scrubbed</span>
            <span className="text-2xl font-bold text-emerald-400 font-mono">{removedCount}</span>
          </div>

          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">Pending Opt-Out</span>
            <span className="text-2xl font-bold text-amber-400 font-mono">{pendingCount}</span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 max-w-sm w-full">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search active removals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-white placeholder-slate-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          {(['all', 'in_progress', 'removed'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-colors cursor-pointer capitalize ${
                filter === mode
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-950 hover:bg-slate-800 text-slate-300'
              }`}
            >
              {mode.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filteredItems.map((result) => {
          const broker = DATA_BROKERS.find((b) => b.id === result.brokerId);
          if (!broker) return null;
          const searchUrl = getBrokerRecordSearchUrl(broker, profile);
          const isRemoved = result.removalStatus === 'removed';

          return (
            <div
              key={result.id}
              className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">{broker.name}</span>
                  <span className="text-slate-500 font-mono">({broker.domain})</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      isRemoved
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                    }`}
                  >
                    {isRemoved ? 'Verified Scrubbed' : 'Statutory Processing (15-45 Days)'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-slate-400 text-[11px]">
                  <span>Mandatory Timeline: <strong className="text-white">{broker.removalTime}</strong></span>
                  {result.optOutConfirmationCode && (
                    <span>Ref Code: <strong className="text-emerald-400 font-mono">{result.optOutConfirmationCode}</strong></span>
                  )}
                  {result.submissionDate && <span>Submitted: {result.submissionDate}</span>}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={searchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-sky-400 flex items-center gap-1.5 font-medium transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />
                  Verify on Broker Site
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>

                <button
                  onClick={() => onToggleStatus(broker.id)}
                  className={`px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    isRemoved
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-slate-800 hover:bg-slate-700 text-white'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {isRemoved ? 'Scrubbed (Undo)' : 'Confirm Expunged'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
