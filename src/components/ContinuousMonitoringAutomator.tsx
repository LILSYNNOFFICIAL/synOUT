import React, { useState, useEffect } from 'react';
import { UserProfile, ScanResult } from '../types';
import { triggerAutonomousRegistryExpansion } from '../utils/dynamicBrokerRegistry';
import { 
  Zap, 
  RotateCcw, 
  ShieldCheck, 
  Bell, 
  Clock, 
  CheckCircle2, 
  Play, 
  Pause, 
  AlertTriangle, 
  Flame, 
  Layers, 
  ArrowUpRight 
} from 'lucide-react';

interface ContinuousMonitoringAutomatorProps {
  profile: UserProfile | null;
  scanResults: ScanResult[];
  onAutoPurge: (brokerId: string, logMsg: string) => void;
}

interface AutoLogEvent {
  id: string;
  timestamp: string;
  brokerName: string;
  brokerDomain: string;
  action: 'NEW_RECORD_DETECTED' | 'AUTONOMOUS_PURGE_DISPATCHED' | 'SUPPRESSION_CONFIRMED';
  details: string;
}

export const ContinuousMonitoringAutomator: React.FC<ContinuousMonitoringAutomatorProps> = ({
  profile,
  scanResults,
  onAutoPurge,
}) => {
  const [isAutomatorActive, setIsAutomatorActive] = useState<boolean>(true);
  const [autoRemoveEnabled, setAutoRemoveEnabled] = useState<boolean>(true);
  const [checkIntervalHours, setCheckIntervalHours] = useState<number>(24);
  const [events, setEvents] = useState<AutoLogEvent[]>([
    {
      id: 'log-1',
      timestamp: 'Just now',
      brokerName: 'Whitepages Network',
      brokerDomain: 'whitepages.com',
      action: 'AUTONOMOUS_PURGE_DISPATCHED',
      details: 'Automated CCPA § 1798.105 suppression payload delivered via server-side gateway.',
    },
    {
      id: 'log-2',
      timestamp: '4 hours ago',
      brokerName: 'Spokeo Social Dossier',
      brokerDomain: 'spokeo.com',
      action: 'AUTONOMOUS_PURGE_DISPATCHED',
      details: 'Statutory opt-out demand verified and submitted with Limited Power of Attorney credentials.',
    },
    {
      id: 'log-3',
      timestamp: '12 hours ago',
      brokerName: 'AeroRecords Syndicate',
      brokerDomain: 'aerorecords.org',
      action: 'NEW_RECORD_DETECTED',
      details: 'Automated continuous crawler discovered newly aggregated listing matching telephone number.',
    },
  ]);

  const [expandedCount, setExpandedCount] = useState<number>(0);
  const [isExpanding, setIsExpanding] = useState(false);

  // Trigger manual registry expansion test
  const handleTriggerExpansion = () => {
    setIsExpanding(true);
    setTimeout(() => {
      const result = triggerAutonomousRegistryExpansion();
      setExpandedCount((prev) => prev + result.newlyDiscoveredCount);
      setIsExpanding(false);

      if (result.newBrokers.length > 0) {
        const newBroker = result.newBrokers[0];
        setEvents((prev) => [
          {
            id: `log-${Date.now()}`,
            timestamp: 'Just now',
            brokerName: newBroker.name,
            brokerDomain: newBroker.domain,
            action: autoRemoveEnabled ? 'AUTONOMOUS_PURGE_DISPATCHED' : 'NEW_RECORD_DETECTED',
            details: autoRemoveEnabled
              ? `Newly indexed data broker detected. Auto-purge engine dispatched CCPA demand to ${newBroker.privacyEmail}.`
              : `Newly indexed data broker discovered by autonomous crawler. Queueing for user review.`,
          },
          ...prev,
        ]);
        if (autoRemoveEnabled) {
          onAutoPurge(newBroker.id, `Autonomous removal dispatched to ${newBroker.name}`);
        }
      }
    }, 1200);
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" /> 24/7 Autonomous Threat Defense
              </span>
              <span className="text-xs text-slate-400">Continuous Background Scanning & Auto-Removal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              Continuous Monitoring & Automated Removal Engine
            </h1>
            <p className="text-sm text-slate-400 max-w-3xl">
              synOUT continuously audits data broker databases, state court registries, and newly launched people finder syndicates. When a new record appears, the engine automatically dispatches legal removal demands without requiring manual action.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsAutomatorActive(!isAutomatorActive)}
              className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg cursor-pointer ${
                isAutomatorActive
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              {isAutomatorActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isAutomatorActive ? 'Monitoring Active' : 'Resume Monitoring'}
            </button>
          </div>
        </div>
      </div>

      {/* Control Panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Toggle 1: Auto-Removal Automation */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Autonomous Opt-Out Dispatch
            </span>
            <button
              onClick={() => setAutoRemoveEnabled(!autoRemoveEnabled)}
              className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                autoRemoveEnabled ? 'bg-emerald-500' : 'bg-slate-800'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  autoRemoveEnabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <h3 className="text-lg font-bold text-white">
            {autoRemoveEnabled ? 'Instant Auto-Removal: ON' : 'Manual Review Mode'}
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            {autoRemoveEnabled
              ? 'Whenever an unscrubbed record or new broker appears, synOUT automatically dispatches statutory deletion demands instantly.'
              : 'New records are flagged for manual user confirmation before suppression requests are dispatched.'}
          </p>
        </div>

        {/* Setting 2: Monitoring Interval */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Automated Re-Check Frequency
          </span>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-sky-400" />
            Every {checkIntervalHours} Hours
          </h3>
          <div className="flex items-center gap-2 pt-1">
            {[6, 12, 24, 72].map((hrs) => (
              <button
                key={hrs}
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
            Next autonomous sweep scheduled in <strong className="text-white">4 hours 18 minutes</strong>.
          </p>
        </div>

        {/* Feature 3: Self-Growing Exhaustive Registry */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Autonomous Registry Expansion
          </span>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-400" />
            Self-Expanding Broker Pool
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            The crawler automatically indexes newly registered people directories and public record scrapers without manual configuration.
          </p>
          <button
            onClick={handleTriggerExpansion}
            disabled={isExpanding}
            className="w-full px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-emerald-400 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isExpanding ? 'animate-spin' : ''}`} />
            {isExpanding ? 'Crawling Clear Web...' : 'Trigger Crawler Sweep Now'}
          </button>
        </div>
      </div>

      {/* Live Stream Activity Log */}
      <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Continuous Protection Live Activity Stream
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Audit Stream Active
          </span>
        </div>

        <div className="space-y-3">
          {events.map((ev) => (
            <div
              key={ev.id}
              className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      ev.action === 'AUTONOMOUS_PURGE_DISPATCHED'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}
                  >
                    {ev.action === 'AUTONOMOUS_PURGE_DISPATCHED'
                      ? 'SUPPRESSION DISPATCHED'
                      : 'NEW THREAT INDEXED'}
                  </span>
                  <strong className="text-white">{ev.brokerName}</strong>
                  <span className="text-slate-500 font-mono">({ev.brokerDomain})</span>
                </div>
                <p className="text-slate-300">{ev.details}</p>
              </div>

              <span className="text-slate-500 font-mono text-[11px] flex-shrink-0">{ev.timestamp}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
