import React from 'react';
import { ArrowRight, Lock, CheckCircle2, Skull, Flame } from 'lucide-react';

interface HeroSectionProps {
  onStartScan: () => void;
  onExploreBrokers: () => void;
  onNukeAll?: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onStartScan,
  onExploreBrokers,
  onNukeAll,
}) => {
  return (
    <div className="relative py-16 sm:py-24 overflow-hidden">
      {/* Subtle Ambient Surface Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[680px] h-[420px] bg-emerald-500/8 blur-[140px] pointer-events-none rounded-full" />

      <div className="relative max-w-5xl mx-auto px-4 text-center space-y-8">
        {/* Clean Unboxed Typographic Kicker */}
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-mono text-slate-400">
          <span className="text-emerald-400 font-semibold">synOUT Privacy Engine</span>
          <span aria-hidden="true">·</span>
          <span>Direct User-Connected Email Opt-Outs</span>
          <span aria-hidden="true">·</span>
          <span>CCPA, CPRA &amp; TDPSA Enforcement</span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight [text-wrap:balance] max-w-4xl mx-auto">
          Eliminate Your Identity From{' '}
          <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-sky-400 bg-clip-text text-transparent">
            700+ Data Brokers &amp; Dark Web Leaks
          </span>
        </h1>

        {/* Subhead */}
        <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Connect your own email account to send legally binding deletion demands directly on your behalf, eliminate homonym false positives, track 10 search vectors, and verify permanent removal.
        </p>

        {/* Unboxed Capability Strip */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-300 pt-1">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Zero Homonym False Positives</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Multi-State Cross-Jurisdiction Matching</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Skull className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>Dark Web &amp; Tor Takedown Guides</span>
          </span>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-4 pt-3">
          <button
            onClick={onStartScan}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-colors shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <span>Start Free Exposure Audit</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {onNukeAll && (
            <button
              type="button"
              onClick={onNukeAll}
              className="w-full sm:w-auto px-7 py-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white border border-red-400/30 font-extrabold text-sm transition-colors shadow-xl shadow-red-600/25 flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Flame className="w-4 h-4" />
              <span>NUKE ALL Brokers &amp; Websites</span>
            </button>
          )}

          <button
            onClick={onExploreBrokers}
            className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            Browse 700+ Broker Directory
          </button>
        </div>
      </div>
    </div>
  );
};
