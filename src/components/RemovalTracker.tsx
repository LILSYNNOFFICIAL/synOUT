import React, { useState } from 'react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import { getBrokerRecordSearchUrl } from '../utils/scanEngine';
import {
  findBrokerById,
  hasVerifiedEmailReceipt,
  useEmailConnection,
} from '../services/emailConnectionStore';
import {
  computeBrokerSlaStatus,
  generateIcsCalendarEvent,
} from '../utils/statutorySlaEngine';
import { downloadFile } from '../utils/exportEngines';
import { hasWebFormSubmission } from '../utils/optOutFormEngine';
import {
  ExternalLink,
  FileText,
  ShieldCheck,
  Calendar,
  Search,
  Globe,
  Mail,
  Scale,
  AlertTriangle,
  Inbox,
  Flame,
  FileCode2,
} from 'lucide-react';

interface RemovalTrackerProps {
  results: ScanResult[];
  profile: UserProfile;
  onOpenListingModal: (broker: DataBroker, result: ScanResult) => void;
  onOpenLegalNotice: (broker: DataBroker, result: ScanResult) => void;
  onOpenEscalationModal?: (broker: DataBroker, result: ScanResult) => void;
  onOpenReplyTriage?: (broker?: DataBroker, result?: ScanResult) => void;
  onToggleStatus: (brokerId: string) => void;
  onBatchOptOut: () => void;
  onAutomatedOptOut?: (brokerId: string) => void;
  onOpenDiyAssistantModal: (broker: DataBroker, result: ScanResult) => void;
  onOpenNukeAll?: () => void;
  onOpenWebFormWorkbench?: (broker?: DataBroker) => void;
}

export const RemovalTracker: React.FC<RemovalTrackerProps> = ({
  results,
  profile,
  onOpenLegalNotice,
  onOpenEscalationModal,
  onOpenReplyTriage,
  onToggleStatus,
  onBatchOptOut,
  onAutomatedOptOut,
  onOpenDiyAssistantModal,
  onOpenNukeAll,
  onOpenWebFormWorkbench,
}) => {
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'needs_escalation' | 'removed'>('all');
  const [search, setSearch] = useState('');

  const { isDirectSendConnected, activeConnectedEmail } = useEmailConnection();
  const isItemSubmittedAnyChannel = (r: ScanResult) =>
    hasVerifiedEmailReceipt(r) || hasWebFormSubmission(r) || r.removalStatus === 'submitted';

  const trackingItems = results.filter(
    (r) => r.removalStatus === 'submitted' || r.removalStatus === 'removed' || r.status === 'exposed'
  );

  const submittedCount = results.filter(
    (r) => isItemSubmittedAnyChannel(r) && r.removalStatus !== 'removed'
  ).length;
  const removedCount = results.filter((r) => r.removalStatus === 'removed').length;
  const pendingCount = results.filter(
    (r) => r.status === 'exposed' && !isItemSubmittedAnyChannel(r) && r.removalStatus !== 'removed'
  ).length;
  const overdueOrApproachingCount = trackingItems.filter((item) => {
    const sla = computeBrokerSlaStatus(item);
    return sla.state === 'overdue' || sla.state === 'approaching_deadline';
  }).length;

  const filteredItems = trackingItems.filter((item) => {
    const broker = findBrokerById(item.brokerId);
    if (!broker) return false;

    const matchesSearch =
      broker.name.toLowerCase().includes(search.toLowerCase()) ||
      broker.domain.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;

    if (filter === 'in_progress') {
      return isItemSubmittedAnyChannel(item) && item.removalStatus !== 'removed';
    }
    if (filter === 'needs_escalation') {
      const sla = computeBrokerSlaStatus(item);
      return (
        item.removalStatus === 'submitted' &&
        (sla.state === 'overdue' || sla.state === 'approaching_deadline' || Boolean(item.escalationCount))
      );
    }
    if (filter === 'removed') return item.removalStatus === 'removed';
    return true;
  });

  const handleDownloadBatchSlaIcs = () => {
    const targetDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
    const ics = generateIcsCalendarEvent({
      title: `synOUT 45-Day Statutory Compliance Verification (${profile.firstName} ${profile.lastName})`,
      description: `Verify that all ${trackingItems.length} actioned data brokers have permanently expunged your personal records within the 45-day CCPA/CPRA/TDPSA statutory window, or file CPPA/OAG enforcement complaints inside synOUT.`,
      startDate: targetDate,
      durationMinutes: 45,
    });
    downloadFile(
      ics,
      `synout-45day-sla-audit-${profile.lastName.toLowerCase()}.ics`,
      'text/calendar;charset=utf-8'
    );
  };

  const handleDownloadSingleBrokerIcs = (broker: DataBroker, result: ScanResult) => {
    const sla = computeBrokerSlaStatus(result);
    const startDate =
      sla.deadlineDate || new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
    const ics = generateIcsCalendarEvent({
      title: `synOUT 45-Day SLA Deadline: Verify ${broker.name} (${broker.domain})`,
      description: `Statutory 45-day deletion deadline for ${broker.name}. Receipt: ${result.optOutConfirmationCode || 'Pending'}. Verify removal at ${getBrokerRecordSearchUrl(broker, profile)} or escalate to CPPA/OAG.`,
      startDate,
      durationMinutes: 30,
      url: getBrokerRecordSearchUrl(broker, profile),
    });
    downloadFile(
      ics,
      `synout-sla-${broker.id}.ics`,
      'text/calendar;charset=utf-8'
    );
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-3xl space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              Removal &amp; 45-Day Statutory SLA Tracker
            </h1>
            <p className="text-xs text-slate-400">
              Tracks 45-day statutory compliance countdowns (CCPA / CPRA / TDPSA), dispatches overdue cure notices, and builds CPPA &amp; State AG enforcement packets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {onOpenWebFormWorkbench && (
              <button
                type="button"
                onClick={() => onOpenWebFormWorkbench()}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-emerald-500/30 text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <FileCode2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Opt-Out Forms</span>
              </button>
            )}

            {onOpenReplyTriage && (
              <button
                type="button"
                onClick={() => onOpenReplyTriage()}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Inbox className="w-3.5 h-3.5 text-emerald-400" />
                <span>Triage Broker Reply</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadBatchSlaIcs}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>45-Day Calendar Reminder (.ics)</span>
            </button>

            <button
              onClick={onBatchOptOut}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-lg shadow-emerald-500/20 cursor-pointer inline-flex items-center gap-2 whitespace-nowrap tabular-nums"
            >
              <Mail className="w-4 h-4" />
              <span>
                {pendingCount > 0
                  ? `Opt Out of All ${pendingCount} Pending${isDirectSendConnected && activeConnectedEmail ? ` (${activeConnectedEmail})` : ''}`
                  : 'Re-Send All Opt-Out Emails'}
              </span>
            </button>

            {onOpenNukeAll && (
              <button
                type="button"
                onClick={onOpenNukeAll}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white border border-red-400/30 text-xs font-extrabold transition-colors shadow-lg shadow-red-600/25 cursor-pointer inline-flex items-center gap-2 whitespace-nowrap"
              >
                <Flame className="w-4 h-4" />
                <span>NUKE ALL</span>
              </button>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 tabular-nums">
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">
              In Statutory SLA
            </span>
            <span className="text-2xl font-bold text-sky-400 font-mono">{submittedCount}</span>
          </div>

          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">
              Confirmed Scrubbed
            </span>
            <span className="text-2xl font-bold text-emerald-400 font-mono">{removedCount}</span>
          </div>

          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">
              Pending Opt-Out
            </span>
            <span className="text-2xl font-bold text-amber-400 font-mono">{pendingCount}</span>
          </div>

          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">
              Overdue / Escalate
            </span>
            <span className="text-2xl font-bold text-rose-400 font-mono">
              {overdueOrApproachingCount}
            </span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 max-w-sm w-full">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search active removals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-white placeholder-slate-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['all', 'All'],
              ['in_progress', 'In SLA Progress'],
              ['needs_escalation', 'Due / Escalate'],
              ['removed', 'Scrubbed'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                filter === mode
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filteredItems.map((result) => {
          const broker = findBrokerById(result.brokerId);
          if (!broker) return null;
          const searchUrl = getBrokerRecordSearchUrl(broker, profile);
          const isRemoved = result.removalStatus === 'removed';
          const isEmailVerified = hasVerifiedEmailReceipt(result);
          const isWebFormSubmitted = hasWebFormSubmission(result);
          const sla = computeBrokerSlaStatus(result);

          return (
            <div
              key={result.id}
              className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col xl:flex-row xl:items-center justify-between gap-4 text-xs"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-white text-sm">{broker.name}</span>
                  <span className="text-slate-500 font-mono">({broker.domain})</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold tabular-nums ${
                      isRemoved
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : sla.state === 'overdue'
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                        : sla.state === 'approaching_deadline'
                        ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                        : isEmailVerified || isWebFormSubmitted
                        ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}
                  >
                    {isRemoved
                      ? 'Verified Scrubbed'
                      : sla.state === 'overdue'
                      ? `SLA OVERDUE (${sla.daysElapsed}d Elapsed · Escalate Now)`
                      : sla.state === 'approaching_deadline'
                      ? `SLA Due in ${sla.daysRemaining}d (Due ${sla.deadlineDateLabel})`
                      : isEmailVerified && isWebFormSubmitted
                      ? `Web Form + Email · ${sla.daysRemaining}d Left on 45-Day SLA`
                      : isEmailVerified
                      ? `Email Sent · ${sla.daysRemaining}d Left on 45-Day SLA`
                      : isWebFormSubmitted
                      ? `Web Form Submitted · ${sla.daysRemaining}d Left on 45-Day SLA`
                      : 'Pending Removal Action'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-400 text-[11px] tabular-nums">
                  <span>
                    Broker Speed: <strong className="text-white">{broker.removalTime}</strong>
                  </span>
                  {result.optOutConfirmationCode && (
                    <span>
                      Receipt: <strong className="text-emerald-400 font-mono">{result.optOutConfirmationCode}</strong>
                    </span>
                  )}
                  {result.webFormConfirmationCode &&
                    result.webFormConfirmationCode !== result.optOutConfirmationCode && (
                      <span>
                        Web Form Ref:{' '}
                        <strong className="text-emerald-300 font-mono">
                          {result.webFormConfirmationCode}
                        </strong>
                      </span>
                    )}
                  {result.discoveredOptOutTitle && (
                    <span>
                      Portal: <strong className="text-slate-200">{result.discoveredOptOutTitle}</strong>
                    </span>
                  )}
                  {result.brokerConfirmationTicket && (
                    <span>
                      Broker Ticket: <strong className="text-sky-300 font-mono">{result.brokerConfirmationTicket}</strong>
                    </span>
                  )}
                  {sla.submittedDateLabel && <span>Sent: {sla.submittedDateLabel}</span>}
                  {sla.deadlineDateLabel && !isRemoved && (
                    <span>Statutory Deadline: <strong className="text-slate-200">{sla.deadlineDateLabel}</strong></span>
                  )}
                  {Boolean(result.escalationCount) && (
                    <span className="text-amber-300 font-mono flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Escalated ×{result.escalationCount}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {!isRemoved && onAutomatedOptOut && (
                  <button
                    onClick={() => onAutomatedOptOut(broker.id)}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                      isEmailVerified
                        ? 'bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                    }`}
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>{isEmailVerified ? 'Re-Send' : 'Send Email'}</span>
                  </button>
                )}

                {!isRemoved && onOpenWebFormWorkbench && (
                  <button
                    type="button"
                    onClick={() => onOpenWebFormWorkbench(broker)}
                    className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1 font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      isWebFormSubmitted
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-emerald-300 hover:text-emerald-200'
                    }`}
                    title="Find Opt-Out Page & Auto-Fill Web Form"
                  >
                    <FileCode2 className="w-3.5 h-3.5" />
                    <span>{isWebFormSubmitted ? 'Form Logged' : 'Web Form'}</span>
                  </button>
                )}

                {onOpenReplyTriage && (
                  <button
                    type="button"
                    onClick={() => onOpenReplyTriage(broker, result)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-emerald-300 hover:text-emerald-200 flex items-center gap-1 font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    title="Parse Inbound Broker Reply, Strip Tracking Links, or Counter ID Demand"
                  >
                    <Inbox className="w-3.5 h-3.5" />
                    <span>Triage Reply</span>
                  </button>
                )}

                {!isRemoved && onOpenEscalationModal && (
                  <button
                    type="button"
                    onClick={() => onOpenEscalationModal(broker, result)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-amber-500/30 text-amber-300 hover:text-amber-200 flex items-center gap-1 font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    title="Send Second Statutory Cure Notice or Generate CPPA/OAG Complaint"
                  >
                    <Scale className="w-3.5 h-3.5" />
                    <span>Escalate / Complaint</span>
                  </button>
                )}

                {!isRemoved && result.removalStatus === 'submitted' && (
                  <button
                    type="button"
                    onClick={() => handleDownloadSingleBrokerIcs(broker, result)}
                    className="p-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-emerald-400 transition-colors cursor-pointer"
                    title="Add 45-Day SLA Deadline to Calendar (.ics)"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  onClick={() => onOpenLegalNotice(broker, result)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white flex items-center gap-1 font-medium transition-colors cursor-pointer whitespace-nowrap"
                  title="Custom Legal Demand"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Notice</span>
                </button>

                <button
                  onClick={() => onOpenDiyAssistantModal(broker, result)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white font-medium transition-colors cursor-pointer"
                  title="Step-by-Step DIY Opt-Out"
                >
                  DIY
                </button>

                <a
                  href={searchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-sky-400 flex items-center gap-1.5 font-medium transition-colors whitespace-nowrap"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Verify on Site</span>
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>

                <button
                  onClick={() => onToggleStatus(broker.id)}
                  className={`px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    isRemoved
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-slate-800 hover:bg-slate-700 text-white'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{isRemoved ? 'Scrubbed (Undo)' : 'Confirm Expunged'}</span>
                </button>
              </div>
            </div>
          );
        })}

        {filteredItems.length === 0 && (
          <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center text-xs text-slate-400">
            No brokers match the selected lifecycle filter.
          </div>
        )}
      </div>
    </div>
  );
};
