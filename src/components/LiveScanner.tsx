import React, { useState, useEffect } from 'react';
import { ScanResult, UserProfile } from '../types';
import { getExhaustiveBrokerRegistry } from '../utils/dynamicBrokerRegistry';
import { Activity, Server } from 'lucide-react';

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
        }, 500);
      }
    }, 45);

    return () => clearInterval(interval);
  }, [pendingResults, onComplete]);

  const exposedCount = scannedResults.filter((r) => r.status === 'exposed').length;
  const cleanCount = scannedResults.filter((r) => r.status === 'clean').length;

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 space-y-6">
      {/* Minimalist Glassmorphic Audit Progress Panel */}
      <div className="glass-panel rounded-2xl p-8 space-y-6 text-center relative overflow-hidden">
        <div className="relative flex items-center justify-center mx-auto">
          <div className="w-12 h-12 rounded-xl glass-subtle flex items-center justify-center text-emerald-400">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-mono text-emerald-400 font-medium">
            Jurisdiction &amp; Exposure Audit · Live Repository Sweep
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight tabular-nums">
            Evaluating {total} Data Broker Repositories
          </h1>
          <p className="text-xs text-slate-400">
            Screening exposure likelihood &amp; homonym conflicts for{' '}
            <strong className="text-white font-semibold">
              {profile.firstName} {profile.lastName}
            </strong>{' '}
            in{' '}
            <strong className="text-white font-semibold">
              {profile.currentCity}, {profile.currentState}
            </strong>
          </p>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2.5 max-w-xl mx-auto">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 px-0.5 tabular-nums">
            <span className="flex items-center gap-1.5 text-slate-300 truncate">
              <Server className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Probing</span>
              <span aria-hidden="true">·</span>
              <span className="text-white font-semibold truncate">{activeBrokerDomain}</span>
            </span>
            <span className="font-semibold text-emerald-400">{progressPercent}%</span>
          </div>

          <div className="w-full glass-subtle h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-emerald-500 to-teal-300 h-full rounded-full transition-all duration-150"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono px-0.5 tabular-nums">
            <span>
              {currentIndex + 1} / {total} Repositories
            </span>
            <button
              type="button"
              onClick={() => onComplete(pendingResults)}
              className="text-emerald-400 hover:text-emerald-300 font-sans font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              Instant Results →
            </button>
          </div>
        </div>

        {/* Hairline-Divided Live Counters */}
        <div className="grid grid-cols-3 divide-x divide-white/[0.06] border-t border-white/[0.08] pt-5 max-w-lg mx-auto tabular-nums">
          <div className="px-3 text-center">
            <span className="text-[11px] text-slate-400 block">Evaluated</span>
            <span className="text-xl font-bold text-white font-mono">{currentIndex + 1}</span>
          </div>

          <div className="px-3 text-center">
            <span className="text-[11px] text-slate-400 block">Likely Exposed</span>
            <span className="text-xl font-bold text-rose-400 font-mono">{exposedCount}</span>
          </div>

          <div className="px-3 text-center">
            <span className="text-[11px] text-slate-400 block">Low Risk</span>
            <span className="text-xl font-bold text-emerald-400 font-mono">{cleanCount}</span>
          </div>
        </div>
      </div>

      {/* Live Stream Feed */}
      <div className="glass-panel rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold text-slate-200">Recent Repository Checks</span>
          <span className="font-mono tabular-nums text-[11px]">Streaming results</span>
        </div>

        <div className="glass-subtle p-4 rounded-xl font-mono text-xs text-slate-300 divide-y divide-white/[0.05] max-h-56 overflow-y-auto tabular-nums">
          {scannedResults
            .slice(-7)
            .reverse()
            .map((res) => {
              const broker = registry.find((b) => b.id === res.brokerId);
              return (
                <div key={res.id} className="py-1.5 flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-2 min-w-0 truncate">
                    <span
                      className={
                        res.status === 'exposed'
                          ? 'text-rose-400 font-semibold shrink-0'
                          : 'text-emerald-400 shrink-0'
                      }
                    >
                      {res.status === 'exposed' ? 'Exposed' : 'Clean'}
                    </span>
                    <span aria-hidden="true" className="text-slate-600">
                      ·
                    </span>
                    <span className="text-white font-medium truncate">
                      {broker?.name || res.brokerId}
                    </span>
                    <span className="text-slate-500 truncate">{broker?.domain}</span>
                  </div>
                  <span className="text-slate-500 text-[11px] shrink-0">
                    {res.status === 'exposed'
                      ? `${res.mockListingData.recordsCount} records`
                      : 'disqualified'}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
