import React, { useState, useMemo, useEffect } from 'react';
import { DataBroker, UserProfile, ScanResult } from '../types';
import {
  getExhaustiveBrokerRegistry,
  triggerAutonomousRegistryExpansion,
} from '../utils/dynamicBrokerRegistry';
import {
  useEmailConnection,
  findBrokerById,
  hasVerifiedEmailReceipt,
} from '../services/emailConnectionStore';
import { sessionFetch } from '../services/sessionClient';
import {
  LiveRelistingProbeDiff,
  RelistingCadenceDays,
  computeRelistingSchedule,
  loadRelistingMonitorConfig,
  saveRelistingMonitorConfig,
} from '../utils/relistingMonitorEngine';
import {
  RotateCcw,
  Play,
  Pause,
  Mail,
  Send,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  FileCode2,
} from 'lucide-react';

interface ContinuousMonitoringAutomatorProps {
  profile: UserProfile | null;
  scanResults: ScanResult[];
  onBrokerDiscovered: (broker: DataBroker, queueForImmediateOptOut: boolean) => void;
  onBatchOptOut?: () => void;
  onSingleOptOut?: (brokerId: string) => void;
  onOpenConnectEmail?: () => void;
  onApplyRelistingDiffs?: (diffs: LiveRelistingProbeDiff[]) => void;
  onOpenWebFormWorkbench?: (broker?: DataBroker) => void;
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
  onApplyRelistingDiffs,
  onOpenWebFormWorkbench,
}) => {
  const { isDirectSendConnected, activeConnectedEmail } = useEmailConnection();
  const [monitorConfig, setMonitorConfig] = useState(() => loadRelistingMonitorConfig());
  const [isSweeping, setIsSweeping] = useState(false);
  const [sweepError, setSweepError] = useState<string | null>(null);

  const [isAutomatorActive, setIsAutomatorActive] = useState<boolean>(true);
  const [autoRemoveEnabled, setAutoRemoveEnabled] = useState<boolean>(true);
  const [crawledNotices, setCrawledNotices] = useState<CrawledBrokerNotice[]>([]);
  const [isExpanding, setIsExpanding] = useState(false);

  useEffect(() => {
    saveRelistingMonitorConfig(monitorConfig);
  }, [monitorConfig]);

  const exposedResults = useMemo(
    () => scanResults.filter((r) => r.status === 'exposed'),
    [scanResults]
  );

  const pendingResults = useMemo(
    () => exposedResults.filter((r) => !hasVerifiedEmailReceipt(r) && r.removalStatus !== 'removed'),
    [exposedResults]
  );

  const scheduleItems = useMemo(
    () => computeRelistingSchedule(scanResults, monitorConfig.cadenceDays),
    [scanResults, monitorConfig.cadenceDays]
  );

  const resurfacedBrokers = useMemo(
    () => scanResults.filter((r) => Boolean(r.isRegression)),
    [scanResults]
  );

  const handleSetCadence = (days: RelistingCadenceDays) => {
    setMonitorConfig((prev) => ({ ...prev, cadenceDays: days }));
  };

  const handleRunRelistingSweep = async () => {
    setSweepError(null);
    setIsSweeping(true);
    try {
      const registry = getExhaustiveBrokerRegistry();
      const targetEntries =
        scheduleItems.length > 0
          ? scheduleItems.slice(0, 12).map((s) => ({
              broker: findBrokerById(s.brokerId) || registry.find((b) => b.id === s.brokerId),
              baselineStatus: s.baselineStatus,
            }))
          : exposedResults.slice(0, 10).map((r) => ({
              broker: findBrokerById(r.brokerId),
              baselineStatus: r.removalStatus === 'removed' ? 'removed' : 'submitted',
            }));

      const validTargets = targetEntries.filter((t) => Boolean(t.broker));
      if (validTargets.length === 0) {
        throw new Error('Run an exposure scan first so synOUT has broker records to monitor.');
      }

      const res = await sessionFetch('/api/monitoring/batch-recheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brokers: validTargets,
          profile,
          previousHashes: monitorConfig.snapshotHashesByBroker,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Sweep failed (HTTP ${res.status})`);
      }

      const diffs: LiveRelistingProbeDiff[] = Array.isArray(data.diffs) ? data.diffs : [];
      const updatedHashes = { ...monitorConfig.snapshotHashesByBroker };
      for (const d of diffs) {
        updatedHashes[d.brokerId] = d.snapshotSha256;
      }

      setMonitorConfig((prev) => ({
        ...prev,
        lastSweepIso: new Date().toISOString(),
        snapshotHashesByBroker: updatedHashes,
        recentDiffs: [...diffs, ...prev.recentDiffs].slice(0, 30),
      }));

      if (onApplyRelistingDiffs) {
        onApplyRelistingDiffs(diffs);
      }
    } catch (err) {
      setSweepError(err instanceof Error ? err.message : 'Batch re-listing sweep failed.');
    } finally {
      setIsSweeping(false);
    }
  };

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
    }, 500);
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-6">
      {/* Section 01: 30 / 60 / 90-Day Re-Listing Diff Monitor */}
      <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
              <span className="text-emerald-400 font-medium">Re-Listing Diff Monitor</span>
              <span aria-hidden="true">·</span>
              <span>{monitorConfig.cadenceDays}-Day Sweep Cadence</span>
              <span aria-hidden="true">·</span>
              <span>{scheduleItems.length} Actioned Brokers Tracked</span>
              {resurfacedBrokers.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-rose-400 font-semibold">
                    {resurfacedBrokers.length} Resurfaced
                  </span>
                </>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight [text-wrap:balance]">
              01. Automated 30 / 60 / 90-Day Re-Listing Surveillance
            </h1>
            <p className="text-sm text-slate-400 max-w-3xl leading-relaxed">
              Re-probes actioned and purged data brokers against live search endpoints, compares SHA-256
              page snapshots, flags resurrected profiles when brokers buy fresh credit-header or utility
              feeds, and triggers repeat suppression.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Segmented Cadence Control */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/60 border border-white/[0.07] tabular-nums">
              {([30, 60, 90] as RelistingCadenceDays[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleSetCadence(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    monitorConfig.cadenceDays === d
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleRunRelistingSweep}
              disabled={isSweeping}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSweeping ? 'animate-spin' : ''}`} />
              <span>{isSweeping ? 'Probing Portals...' : 'Run Live Re-Listing Sweep'}</span>
            </button>

            {pendingResults.length > 0 && isDirectSendConnected && activeConnectedEmail && onBatchOptOut && (
              <button
                type="button"
                onClick={onBatchOptOut}
                className="px-4 py-2.5 rounded-xl glass-subtle hover:border-emerald-400/40 text-emerald-300 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap tabular-nums"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Re-Purge Pending ({pendingResults.length})</span>
              </button>
            )}
          </div>
        </div>

        {sweepError && (
          <div className="glass-subtle rounded-xl p-4 border border-amber-400/25 flex items-center gap-2.5 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{sweepError}</span>
          </div>
        )}

        {/* Recent Live Snapshot Diffs */}
        {monitorConfig.recentDiffs.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.07] text-slate-400 bg-slate-950/40">
                  <th className="py-3 px-4">Broker</th>
                  <th className="py-3 px-4">Outcome</th>
                  <th className="py-3 px-4">Snapshot SHA-256</th>
                  <th className="py-3 px-4">Findings</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {monitorConfig.recentDiffs.slice(0, 12).map((diff, idx) => {
                  const broker = findBrokerById(diff.brokerId);
                  return (
                    <tr key={`${diff.brokerId}-${idx}`} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{diff.brokerName}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{diff.brokerDomain}</div>
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {diff.outcome === 'confirmed_absent' ? (
                          <span className="text-emerald-400 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Confirmed Absent</span>
                          </span>
                        ) : diff.outcome === 'resurfaced_regression' ? (
                          <span className="text-rose-400 inline-flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Resurfaced</span>
                          </span>
                        ) : diff.outcome === 'still_present_within_sla' ? (
                          <span className="text-amber-300">Processing Within SLA</span>
                        ) : (
                          <span className="text-slate-400">Anti-Bot / Spot Check</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400 tabular-nums">
                        {diff.snapshotSha256.slice(0, 14)}…
                      </td>
                      <td className="py-3 px-4 text-slate-300 max-w-md">{diff.summary}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {broker && onOpenWebFormWorkbench && (
                            <button
                              type="button"
                              onClick={() => onOpenWebFormWorkbench(broker)}
                              className="px-2.5 py-1.5 rounded-lg glass-subtle hover:border-emerald-400/30 text-emerald-300 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            >
                              <FileCode2 className="w-3 h-3" />
                              <span>Re-Run Form</span>
                            </button>
                          )}
                          {onSingleOptOut && (
                            <button
                              type="button"
                              onClick={() => onSingleOptOut(diff.brokerId)}
                              className="px-2.5 py-1.5 rounded-lg glass-subtle hover:border-white/20 text-slate-200 cursor-pointer whitespace-nowrap"
                            >
                              Re-Email
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 02: Autonomous Clearinghouse Discovery */}
      <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white">
              02. Autonomous Broker Registry Expansion &amp; Queueing
            </h2>
            <p className="text-xs text-slate-400 max-w-2xl">
              Indexes newly registered people-search clearinghouses and queues statutory suppression
              notices through your connected sender ({activeConnectedEmail || 'connect email to enable'}).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setAutoRemoveEnabled((v) => !v)}
              className={`px-3.5 py-2 rounded-xl text-xs font-medium glass-subtle cursor-pointer whitespace-nowrap ${
                autoRemoveEnabled ? 'text-emerald-300 border-emerald-400/30' : 'text-slate-400'
              }`}
            >
              Auto-Prompt Email: {autoRemoveEnabled ? 'On' : 'Off'}
            </button>

            <button
              type="button"
              onClick={() => setIsAutomatorActive((v) => !v)}
              className="px-3.5 py-2 rounded-xl text-xs font-medium glass-subtle text-slate-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              {isAutomatorActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isAutomatorActive ? 'Active' : 'Paused'}</span>
            </button>

            <button
              type="button"
              onClick={handleTriggerExpansion}
              disabled={isExpanding}
              className="px-4 py-2 rounded-xl glass-subtle hover:border-emerald-400/40 text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isExpanding ? 'animate-spin' : ''}`} />
              <span>{isExpanding ? 'Indexing...' : 'Discover Clearinghouse'}</span>
            </button>

            {!isDirectSendConnected && onOpenConnectEmail && (
              <button
                type="button"
                onClick={onOpenConnectEmail}
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Connect Email</span>
              </button>
            )}
          </div>
        </div>

        {crawledNotices.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-white/[0.06]">
            {crawledNotices.map((notice) => (
              <div
                key={notice.id}
                className="glass-subtle rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2 text-slate-300 tabular-nums">
                  <span className="font-mono text-slate-500">{notice.timestamp}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-white">{notice.brokerName}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-slate-400">{notice.brokerDomain}</span>
                </div>
                {onSingleOptOut && (
                  <button
                    type="button"
                    onClick={() => onSingleOptOut(notice.brokerId)}
                    className="text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer whitespace-nowrap"
                  >
                    Queue Statutory Demand →
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
