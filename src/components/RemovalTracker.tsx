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
import {
  downloadPdfBytes,
  generateMasterComplianceAuditPdf,
} from '../utils/pdfPacketGenerator';
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
  Bot,
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
  onOpenAutomatedNavigator?: (broker: DataBroker, result: ScanResult) => void;
  onOpenDiyAssistantModal: (broker: DataBroker, result: ScanResult) => void;
  onOpenNukeAll?: () => void;
  onOpenWebFormWorkbench?: (broker?: DataBroker) => void;
  onOpenInboxHarvester?: () => void;
  onOpenStateRegistries?: () => void;
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
  onOpenAutomatedNavigator,
  onOpenDiyAssistantModal,
  onOpenNukeAll,
  onOpenWebFormWorkbench,
  onOpenInboxHarvester,
  onOpenStateRegistries,
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

  const handleDownloadMasterAuditPdf = async () => {
    const pdfBytes = await generateMasterComplianceAuditPdf({
      results,
      profile,
      senderEmail: activeConnectedEmail || undefined,
    });
    downloadPdfBytes(
      pdfBytes,
      `synout-45day-compliance-audit-${profile.lastName.toLowerCase()}.pdf`
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
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-6">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 glass-panel rounded-2xl space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="text-emerald-400 font-medium">45-Day Statutory Compliance</span>
              <span aria-hidden="true">·</span>
              <span>CCPA / CPRA / TDPSA / Delete Act</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight [text-wrap:balance]">
              Removal &amp; 45-Day Statutory SLA Tracker
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
              Monitors statutory deletion countdowns, completes inbound confirmation links via Inbox Harvester, and generates regulator enforcement dossiers when brokers breach SLA deadlines.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {onOpenInboxHarvester && (
              <button
                type="button"
                onClick={onOpenInboxHarvester}
                className="px-3.5 py-2.5 rounded-xl glass-card text-sky-300 hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Inbox className="w-3.5 h-3.5 text-sky-400" />
                <span>Inbox Harvester</span>
              </button>
            )}

            {onOpenStateRegistries && (
              <button
                type="button"
                onClick={onOpenStateRegistries}
                className="px-3.5 py-2.5 rounded-xl glass-card text-slate-200 hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Scale className="w-3.5 h-3.5 text-amber-400" />
                <span>Complaint Packets</span>
              </button>
            )}

            {onOpenWebFormWorkbench && (
              <button
                type="button"
                onClick={() => onOpenWebFormWorkbench()}
                className="px-3.5 py-2.5 rounded-xl glass-card text-emerald-300 hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <FileCode2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Web-Form Runner</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleDownloadMasterAuditPdf()}
              className="px-3.5 py-2.5 rounded-xl glass-card text-amber-300 hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>PDF Audit Packet</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadBatchSlaIcs}
              className="px-3.5 py-2.5 rounded-xl glass-card text-slate-200 hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>45-Day Reminder (.ics)</span>
            </button>

            <button
              onClick={onBatchOptOut}
              className="px-4 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-2 whitespace-nowrap shrink-0 tabular-nums"
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
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white border border-red-400/25 text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <Flame className="w-4 h-4" />
                <span>NUKE ALL</span>
              </button>
            )}
          </div>
        </div>

        {/* Hairline Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.07] border-t border-white/[0.07] pt-5 tabular-nums">
          <div className="py-2 sm:py-0 sm:pr-6">
            <span className="text-xs text-slate-400 block">In Statutory SLA</span>
            <span className="text-2xl font-bold text-sky-400 font-mono mt-0.5 block">{submittedCount}</span>
          </div>

          <div className="py-2 sm:py-0 sm:px-6">
            <span className="text-xs text-slate-400 block">Confirmed Scrubbed</span>
            <span className="text-2xl font-bold text-emerald-400 font-mono mt-0.5 block">{removedCount}</span>
          </div>

          <div className="py-2 sm:py-0 sm:px-6">
            <span className="text-xs text-slate-400 block">Pending Opt-Out</span>
            <span className="text-2xl font-bold text-amber-300 font-mono mt-0.5 block">{pendingCount}</span>
          </div>

          <div className="py-2 sm:py-0 sm:pl-6">
            <span className="text-xs text-slate-400 block">Overdue / Escalate</span>
            <span className="text-2xl font-bold text-rose-400 font-mono mt-0.5 block">
              {overdueOrApproachingCount}
            </span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 glass-panel rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="relative max-w-sm w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search active removals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full glass-input rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500"
          />
        </div>

        <div className="inline-flex flex-wrap items-center gap-1 p-1 glass-subtle rounded-xl">
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
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                filter === mode
                  ? 'bg-emerald-400 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
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

          const statusTextColor = isRemoved
            ? 'text-emerald-400'
            : sla.state === 'overdue'
            ? 'text-rose-400'
            : sla.state === 'approaching_deadline' || result.workflowState === 'awaiting_email_verification'
            ? 'text-amber-300'
            : isEmailVerified || isWebFormSubmitted
            ? 'text-sky-300'
            : 'text-amber-300';

          return (
            <div
              key={result.id}
              className="p-5 glass-card rounded-2xl flex flex-col xl:flex-row xl:items-center justify-between gap-4 text-xs"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white text-sm">{broker.name}</span>
                  <span className="text-slate-500 font-mono">{broker.domain}</span>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <span className={`font-medium tabular-nums ${statusTextColor}`}>
                    {isRemoved
                      ? 'Verified Removed'
                      : sla.state === 'overdue'
                      ? `SLA Overdue (${sla.daysElapsed}d Elapsed · Escalate Now)`
                      : sla.state === 'approaching_deadline'
                      ? `SLA Due in ${sla.daysRemaining}d (Due ${sla.deadlineDateLabel})`
                      : result.workflowState === 'awaiting_email_verification'
                      ? 'Web Form Submitted · Awaiting Email Confirmation Link'
                      : result.workflowState === 'submitted_unconfirmed' && !isEmailVerified
                      ? `Web Form Submitted (Unconfirmed) · ${sla.daysRemaining}d Left on SLA`
                      : isEmailVerified && isWebFormSubmitted
                      ? `Web Form + Email · ${sla.daysRemaining}d Left on 45-Day SLA`
                      : isEmailVerified
                      ? `Email Sent · ${sla.daysRemaining}d Left on 45-Day SLA`
                      : isWebFormSubmitted
                      ? `Web Form Submitted · ${sla.daysRemaining}d Left on 45-Day SLA`
                      : 'Pending Removal Action'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-400 text-[11px] tabular-nums">
                  <span>
                    Typical Speed: <strong className="text-slate-200 font-medium">{broker.removalTime}</strong>
                  </span>
                  {isEmailVerified && result.optOutConfirmationCode && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        Message-ID:{' '}
                        <strong className="text-emerald-400 font-mono">
                          {result.optOutConfirmationCode}
                        </strong>
                      </span>
                    </>
                  )}
                  {result.internalSubmissionId && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        Audit ID:{' '}
                        <strong className="text-slate-300 font-mono">
                          {result.internalSubmissionId}
                        </strong>
                      </span>
                    </>
                  )}
                  {(result.brokerConfirmedReceipt || result.brokerConfirmationTicket) ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        Broker Ticket:{' '}
                        <strong className="text-sky-300 font-mono">
                          {result.brokerConfirmedReceipt || result.brokerConfirmationTicket}
                        </strong>
                      </span>
                    </>
                  ) : isWebFormSubmitted ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        Broker Ticket: <strong className="text-slate-400 font-mono">None issued</strong>
                      </span>
                    </>
                  ) : null}
                  {sla.deadlineDateLabel && !isRemoved && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Statutory Deadline: <strong className="text-slate-200">{sla.deadlineDateLabel}</strong></span>
                    </>
                  )}
                  {Boolean(result.escalationCount) && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-amber-300 font-mono inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Escalated ×{result.escalationCount}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {!isRemoved && onOpenAutomatedNavigator && (
                  <button
                    type="button"
                    onClick={() => onOpenAutomatedNavigator(broker, result)}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      isWebFormSubmitted
                        ? 'bg-emerald-500/15 border border-emerald-400/25 text-emerald-300'
                        : 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                    }`}
                    title="Let synOUT fill out this broker's online form and check required boxes for you"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span>{isWebFormSubmitted ? 'Re-Run Form' : 'Auto-Fill Form'}</span>
                  </button>
                )}

                {!isRemoved && onAutomatedOptOut && (
                  <button
                    onClick={() => onAutomatedOptOut(broker.id)}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      isEmailVerified
                        ? 'glass-subtle hover:bg-white/[0.08] text-slate-300'
                        : onOpenAutomatedNavigator
                        ? 'glass-subtle hover:border-emerald-400/35 text-emerald-300'
                        : 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                    }`}
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>{isEmailVerified ? 'Re-Send Email' : 'Send Email'}</span>
                  </button>
                )}

                {!isRemoved && onOpenWebFormWorkbench && !onOpenAutomatedNavigator && (
                  <button
                    type="button"
                    onClick={() => onOpenWebFormWorkbench(broker)}
                    className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      isWebFormSubmitted
                        ? 'bg-emerald-500/15 border border-emerald-400/25 text-emerald-300'
                        : 'glass-subtle hover:bg-white/[0.08] text-emerald-300'
                    }`}
                    title="Find Opt-Out Page & Auto-Fill Web Form"
                  >
                    <FileCode2 className="w-3.5 h-3.5" />
                    <span>{isWebFormSubmitted ? 'Form Logged' : 'Auto-Fill Form'}</span>
                  </button>
                )}

                {onOpenReplyTriage && (
                  <button
                    type="button"
                    onClick={() => onOpenReplyTriage(broker, result)}
                    className="px-2.5 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.08] text-emerald-300 flex items-center gap-1 font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    title="Parse Inbound Broker Reply, Strip Tracking Links, or Counter ID Demand"
                  >
                    <Inbox className="w-3.5 h-3.5" />
                    <span>Triage</span>
                  </button>
                )}

                {!isRemoved && onOpenEscalationModal && (
                  <button
                    type="button"
                    onClick={() => onOpenEscalationModal(broker, result)}
                    className="px-2.5 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.08] text-amber-300 flex items-center gap-1 font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    title="Send Second Statutory Cure Notice or Generate CPPA/OAG Complaint"
                  >
                    <Scale className="w-3.5 h-3.5" />
                    <span>Escalate</span>
                  </button>
                )}

                {!isRemoved && result.removalStatus === 'submitted' && (
                  <button
                    type="button"
                    onClick={() => handleDownloadSingleBrokerIcs(broker, result)}
                    className="p-1.5 rounded-lg glass-subtle hover:bg-white/[0.08] text-slate-300 hover:text-emerald-400 transition-colors cursor-pointer"
                    title="Add 45-Day SLA Deadline to Calendar (.ics)"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  onClick={() => onOpenLegalNotice(broker, result)}
                  className="px-2.5 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.08] text-slate-300 hover:text-white flex items-center gap-1 font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  title="Custom Legal Demand"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Notice</span>
                </button>

                <button
                  onClick={() => onOpenDiyAssistantModal(broker, result)}
                  className="px-2.5 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.08] text-slate-300 hover:text-white font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  title="Step-by-Step DIY Opt-Out"
                >
                  DIY
                </button>

                <a
                  href={searchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.08] text-sky-400 flex items-center gap-1.5 font-medium transition-colors whitespace-nowrap shrink-0"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Verify</span>
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>

                <button
                  onClick={() => onToggleStatus(broker.id)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    isRemoved
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/25'
                      : 'glass-card text-white hover:bg-white/[0.09]'
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
          <div className="p-8 glass-panel rounded-2xl text-center text-xs text-slate-400">
            No brokers match the selected lifecycle filter.
          </div>
        )}
      </div>
    </div>
  );
};
