import React, { useState, useMemo } from 'react';
import { DataBroker, UserProfile, ScanResult } from '../types';
import { triggerAutonomousRegistryExpansion } from '../utils/dynamicBrokerRegistry';
import {
  useEmailConnection,
  findBrokerById,
  hasVerifiedEmailReceipt,
} from '../services/emailConnectionStore';
import {
  RotateCcw,
  Clock,
  Play,
  Pause,
  Mail,
  Send,
  CheckCircle2,
} from 'lucide-react';

interface ContinuousMonitoringAutomatorProps {
  profile: UserProfile | null;
  scanResults: ScanResult[];
  onBrokerDiscovered: (broker: DataBroker, queueForImmediateOptOut: boolean) => void;
  onBatchOptOut?: () => void;
  onSingleOptOut?: (brokerId: string) => void;
  onOpenConnectEmail?: () => void;
}

interface CrawledBrokerNotice {
  id: string;
  timestamp: string;
  brokerId: string;
  brokerName: string;
  brokerDomain: string;
  privacyEmail: string;
}

export const ContinuousMonitoringAutomator: React.FC<ContinuousMonitoringAutomatorProps> = ({
  profile,
  scanResults,
  onBrokerDiscovered,
  onBatchOptOut,
  onSingleOptOut,
  onOpenConnectEmail,
}) => {
  const { isDirectSendConnected, activeConnectedEmail } = useEmailConnection();
  const [isAutomatorActive, setIsAutomatorActive] = useState<boolean>(true);
  const [autoRemoveEnabled, setAutoRemoveEnabled] = useState<boolean>(true);
  const [checkIntervalHours, setCheckIntervalHours] = useState<number>(24);
  const [crawledNotices, setCrawledNotices] = useState<CrawledBrokerNotice[]>([]);
  const [isExpanding, setIsExpanding] = useState(false);

  const exposedResults = useMemo(
    () => scanResults.filter((r) => r.status === 'exposed'),
    [scanResults]
  );

  const pendingResults = useMemo(
    () => exposedResults.filter((r) => !hasVerifiedEmailReceipt(r) && r.removalStatus !== 'removed'),
    [exposedResults]
  );

  const verifiedSentResults = useMemo(
    () => exposedResults.filter((r) => hasVerifiedEmailReceipt(r)),
    [exposedResults]
  );

  const handleTriggerExpansion = () => {
    setIsExpanding(true);
    setTimeout(() => {
      const result = triggerAutonomousRegistryExpansion();
      setIsExpanding(false);

      if (result.newBrokers.length > 0) {
        const newBroker = result.newBrokers[0];
        setCrawledNotices((prev) => [
          {
            id: `crawl-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            brokerId: newBroker.id,
            brokerName: newBroker.name,
            brokerDomain: newBroker.domain,
            privacyEmail: newBroker.privacyEmail,
          },
          ...prev,
        ]);
        onBrokerDiscovered(newBroker, autoRemoveEnabled);
      }
    }, 600);
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
              <span className="text-emerald-400 font-semibold">Continuous Monitoring &amp; Auto-Removal</span>
              <span aria-hidden="true">·</span>
              <span>{exposedResults.length} Exposed Brokers</span>
              <span aria-hidden="true">·</span>
              <span>{verifiedSentResults.length} Verified Sent</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Continuous Broker Surveillance &amp; Email Dispatch
            </h1>
            <p className="text-sm text-slate-400 max-w-3xl leading-relaxed">
              Audits newly indexed data broker syndicates and routes statutory CCPA, CPRA, and TDPSA deletion notices directly through your connected email account upon confirmation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {isDirectSendConnected && activeConnectedEmail ? (
              pendingResults.length > 0 && onBatchOptOut ? (
                <button
                  type="button"
                  onClick={onBatchOptOut}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Send className="w-4 h-4" />
                  <span>Opt Out of All {pendingResults.length} Pending ({activeConnectedEmail})</span>
                </button>
              ) : null
            ) : (
              onOpenConnectEmail && (
                <button
                  type="button"
                  onClick={onOpenConnectEmail}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Mail className="w-4 h-4" />
                  <span>Connect Email for Auto-Dispatch</span>
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => setIsAutomatorActive(!isAutomatorActive)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                isAutomatorActive
                  ? 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              {isAutomatorActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isAutomatorActive ? 'Monitoring Active' : 'Resume Monitoring'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Control Panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Toggle 1: Auto-Queue Opt-Out Dispatch */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">
              Immediate Email Opt-Out Prompt
            </span>
            <button
              type="button"
              onClick={() => setAutoRemoveEnabled(!autoRemoveEnabled)}
              className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                autoRemoveEnabled ? 'bg-emerald-500' : 'bg-slate-800'
              }`}
              aria-label="Toggle Immediate Email Opt-Out Prompt"
            >
              <div
                className={`bg-white w-4 h-4 rounded-full transition-transform ${
                  autoRemoveEnabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <h3 className="text-lg font-bold text-white">
            {autoRemoveEnabled ? 'Prompt Email Opt-Out: ON' : 'Manual Queue Mode'}
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            {autoRemoveEnabled
              ? `When a new broker record is detected, synOUT immediately opens the opt-out dispatch confirmation using ${
                  activeConnectedEmail || 'your connected email'
                }.`
              : 'Newly discovered broker listings are added to your Exposure Report for manual review.'}
          </p>
        </div>

        {/* Setting 2: Monitoring Interval */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
          <span className="text-xs font-semibold text-slate-400 block">
            Re-Audit Cadence
          </span>
          <h3 className="text-lg font-bold text-white flex items-center gap-2 tabular-nums">
            <Clock className="w-5 h-5 text-sky-400" />
            <span>Every {checkIntervalHours} Hours</span>
          </h3>
          <div className="flex items-center gap-2 pt-1">
            {[6, 12, 24, 72].map((hrs) => (
              <button
                key={hrs}
                type="button"
                onClick={() => setCheckIntervalHours(hrs)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-colors cursor-pointer ${
                  checkIntervalHours === hrs
                    ? 'bg-sky-500 text-slate-950 font-bold'
                    : 'bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                {hrs}h
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            Active subject:{' '}
            <strong className="text-white">
              {profile ? `${profile.firstName} ${profile.lastName}` : 'Run scan to set identity'}
            </strong>
          </p>
        </div>

        {/* Feature 3: Self-Growing Exhaustive Registry */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
          <span className="text-xs font-semibold text-slate-400 block">
            Dynamic Registry Discovery
          </span>
          <h3 className="text-lg font-bold text-white">
            Self-Expanding Broker Pool
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Scans for newly launched people-search mirrors and affiliate directories so you can send statutory opt-out notices immediately.
          </p>
          <button
            type="button"
            onClick={handleTriggerExpansion}
            disabled={isExpanding}
            className="w-full px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-emerald-400 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isExpanding ? 'animate-spin' : ''}`} />
            <span>{isExpanding ? 'Scanning Emerging Syndicates...' : 'Trigger Crawler Sweep Now'}</span>
          </button>
        </div>
      </div>

      {/* Live Queue & Verified Dispatch Ledger */}
      <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <h2 className="text-sm font-bold text-white">
            Verified Email Dispatches &amp; Newly Detected Syndicates
          </h2>
          <span className="text-xs font-mono text-slate-400 tabular-nums">
            {verifiedSentResults.length} Sent · {pendingResults.length} Pending
          </span>
        </div>

        <div className="space-y-2.5">
          {crawledNotices.map((cn) => {
            const matchedResult = scanResults.find((r) => r.brokerId === cn.brokerId);
            const sent = matchedResult ? hasVerifiedEmailReceipt(matchedResult) : false;
            return (
              <div
                key={cn.id}
                className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-white">{cn.brokerName}</strong>
                    <span className="text-slate-500 font-mono">({cn.brokerDomain})</span>
                    <span className="text-slate-600">·</span>
                    <span className={sent ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>
                      {sent ? 'Opt-Out Email Sent' : 'Newly Discovered'}
                    </span>
                  </div>
                  <p className="text-slate-400 font-mono text-[11px]">
                    Compliance Inbox: {cn.privacyEmail} · Discovered at {cn.timestamp}
                  </p>
                </div>

                {!sent && onSingleOptOut && (
                  <button
                    type="button"
                    onClick={() => onSingleOptOut(cn.brokerId)}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Send Opt-Out Email</span>
                  </button>
                )}
              </div>
            );
          })}

          {verifiedSentResults.map((res) => {
            const broker = findBrokerById(res.brokerId);
            if (!broker) return null;
            return (
              <div
                key={res.id}
                className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <strong className="text-white">{broker.name}</strong>
                    <span className="text-slate-500 font-mono">({broker.privacyEmail})</span>
                  </div>
                  <p className="text-slate-400 font-mono text-[11px] truncate">
                    SMTP Receipt: {res.optOutConfirmationCode} · Sent {res.submissionDate || 'Today'}
                  </p>
                </div>
                <span className="text-emerald-400 font-medium shrink-0">Verified Sent</span>
              </div>
            );
          })}

          {crawledNotices.length === 0 && verifiedSentResults.length === 0 && (
            <div className="p-6 bg-slate-950 rounded-xl border border-slate-800 text-center text-xs text-slate-400">
              {exposedResults.length > 0
                ? `${pendingResults.length} exposed broker(s) are ready for opt-out email dispatch. Click "Opt Out of All" above or trigger a crawler sweep.`
                : 'Run an Exposure Audit Scan first or click "Trigger Crawler Sweep Now" to index emerging broker syndicates.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
