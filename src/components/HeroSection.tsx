import React from 'react';
import { Shield, Sparkles, Zap, ArrowRight, Lock, CheckCircle2, Skull } from 'lucide-react';

interface HeroSectionProps {
  onStartScan: () => void;
  onExploreBrokers: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onStartScan, onExploreBrokers }) => {
  return (
    <div className="relative py-16 sm:py-24 overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[450px] bg-emerald-500/10 blur-[140px] pointer-events-none rounded-full" />
      <div className="absolute top-1/3 right-1/4 w-[400px] h-[300px] bg-teal-500/10 blur-[120px] pointer-events-none rounded-full" />

      <div className="relative max-w-5xl mx-auto px-4 text-center space-y-8">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-semibold">
          <Zap className="w-3.5 h-3.5" />
          <span>synOUT 2.0: Autonomous PII Removal Engine</span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
          Eliminate Your Identity From <br />
          <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-sky-400 bg-clip-text text-transparent">
            700+ Data Brokers & Dark Web Leaks
          </span>
        </h1>

        {/* Subhead */}
        <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          The autonomous privacy system that audits clear-web clearinghouses, eliminates false positives, tracks 10 search vectors, and continuously auto-purges your private records.
        </p>

        {/* Feature Pills */}
        <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-300">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Zero False Positives
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800">
            <Lock className="w-3.5 h-3.5 text-emerald-400" /> Multi-State Cross-Jurisdiction Matching
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800">
            <Skull className="w-3.5 h-3.5 text-red-400" /> Dark Web & Tor Takedown Automation
          </span>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <button
            onClick={onStartScan}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Start Free Exposure Audit</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={onExploreBrokers}
            className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-sm font-semibold transition-colors cursor-pointer"
          >
            Browse 700+ Broker Directory
          </button>
        </div>
      </div>
    </div>
  );
};
