import React, { useState, useEffect } from 'react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import { DATA_BROKERS } from '../data/brokers';
import { getExhaustiveBrokerRegistry } from '../utils/dynamicBrokerRegistry';
import { 
  ShieldAlert, 
  ShieldCheck, 
  Activity, 
  Server, 
  Terminal, 
  CheckCircle2, 
  Search, 
  RotateCcw,
  Zap
} from 'lucide-react';

interface LiveScannerProps {
  profile: UserProfile;
  pendingResults: ScanResult[];
  onComplete: (results: ScanResult[]) => void;
}

export const LiveScanner: React.FC<LiveScannerProps> = ({
  profile,
  pendingResults,
  onComplete,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scannedResults, setScannedResults] = useState<ScanResult[]>([]);
  const [activeBrokerDomain, setActiveBrokerDomain] = useState<string>('whitepages.com');

  const registry = getExhaustiveBrokerRegistry();
  const total = pendingResults.length || registry.length;
  const progressPercent = Math.min(100, Math.round(((currentIndex + 1) / total) * 100));

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      if (index < pendingResults.length) {
        const item = pendingResults[index];
        const broker = registry.find((b) => b.id === item.brokerId);
        if (broker) setActiveBrokerDomain(broker.domain);

        setScannedResults((prev) => [...prev, item]);
        setCurrentIndex(index);
        index++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          onComplete(pendingResults);
        }, 600);
      }
    }, 45); // Smooth fast-scrolling scan throughput

    return () => clearInterval(interval);
  }, [pendingResults, onComplete]);

  const exposedCount = scannedResults.filter((r) => r.status === 'exposed').length;
  const cleanCount = scannedResults.filter((r) => r.status === 'clean').length;

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 space-y-8">
      {/* Visual Scanner Radar Header */}
      <div className="p-8 bg-slate-900 border border-slate-800 rounded-3xl space-y-6 text-center relative overflow-hidden shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:24px_24px] opacity-10" />

        {/* Pulsing Radar Ring */}
        <div className="relative flex items-center justify-center mx-auto">
          <div className="absolute w-24 h-24 rounded-full border border-emerald-500/20 animate-ping" />
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Activity className="w-8 h-8 animate-pulse" />
          </div>
        </div>

        <div className="space-y-2 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-semibold">
            <Zap className="w-3.5 h-3.5" /> NEURAL RADAR CRAWLER ACTIVE
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            Auditing 700+ Data Broker Repositories
          </h1>
          <p className="text-xs text-slate-400 font-mono">
            Querying records for <strong className="text-white">{profile.firstName} {profile.lastName}</strong> in{' '}
            <strong className="text-white">{profile.currentCity}, {profile.currentState}</strong>
          </p>
        </div>

        {/* Enhanced Progress Scan Bar */}
        <div className="space-y-2.5 relative z-10 max-w-xl mx-auto">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 px-1">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Server className="w-3.5 h-3.5" />
              Scanning: <span className="text-white font-bold">{activeBrokerDomain}</span>
            </span>
            <span className="font-bold text-white tabular-nums text-sm">{progressPercent}%</span>
          </div>

          <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800 p-0.5">
            <div
              className="bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 h-full rounded-full transition-all duration-150 shadow-[0_0_12px_rgba(16,185,129,0.5)]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono px-1">
            <span>Progress: {currentIndex + 1} / {total} Repositories</span>
            <span>Speed: ~60 queries/sec</span>
          </div>
        </div>

        {/* Live Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-lg mx-auto pt-2 relative z-10">
          <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 text-left">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">Total Verified</span>
            <span className="text-lg font-bold text-white font-mono">{currentIndex + 1}</span>
          </div>

          <div className="p-3 bg-slate-950 rounded-2xl border border-rose-500/20 text-left">
            <span className="text-[10px] text-rose-400 uppercase tracking-wider block font-mono">Exposed Records</span>
            <span className="text-lg font-bold text-rose-400 font-mono">{exposedCount}</span>
          </div>

          <div className="p-3 bg-slate-950 rounded-2xl border border-emerald-500/20 text-left col-span-2 sm:col-span-1">
            <span className="text-[10px] text-emerald-400 uppercase tracking-wider block font-mono">Clean Verified</span>
            <span className="text-lg font-bold text-emerald-400 font-mono">{cleanCount}</span>
          </div>
        </div>
      </div>

      {/* Realtime Stream Feed of Audited Entities */}
      <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
        <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          Live Threat Inspection Stream
        </h3>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 font-mono text-xs text-slate-300 space-y-2 max-h-56 overflow-y-auto">
          {scannedResults.slice(-7).reverse().map((res) => {
            const broker = registry.find((b) => b.id === res.brokerId);
            return (
              <div key={res.id} className="flex items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-2 truncate">
                  <span className={res.status === 'exposed' ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                    [{res.status.toUpperCase()}]
                  </span>
                  <span className="text-white font-semibold truncate">{broker?.name || res.brokerId}</span>
                  <span className="text-slate-500">({broker?.domain})</span>
                </div>
                <span className="text-slate-500 text-[10px] flex-shrink-0">
                  {res.status === 'exposed' ? `${res.mockListingData.recordsCount} records` : 'disqualified'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
