import React, { useState, useEffect } from 'react';
import { Shield, Lock, Terminal, Activity, ChevronRight, Zap } from 'lucide-react';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(15);
  const [isFadingOut, setIsFadingOut] = useState(false);

  const steps = [
    'INITIALIZING NEURAL RADAR MATRIX...',
    'CONNECTING DARK WEB & CLEAR WEB THREAT FEEDS...',
    'INDEXING 700+ DATA BROKER CLEARINGHOUSES...',
    'MOUNTING STATUTORY CCPA / CPRA EXPUNGEMENT ENGINES...',
    'SYSTEM ARMED & SECURE'
  ];

  useEffect(() => {
    const timer1 = setTimeout(() => {
      setStepIndex(1);
      setProgress(40);
    }, 600);

    const timer2 = setTimeout(() => {
      setStepIndex(2);
      setProgress(70);
    }, 1200);

    const timer3 = setTimeout(() => {
      setStepIndex(3);
      setProgress(90);
    }, 1800);

    const timer4 = setTimeout(() => {
      setStepIndex(4);
      setProgress(100);
    }, 2300);

    const timer5 = setTimeout(() => {
      handleFinish();
    }, 2800);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearTimeout(timer5);
    };
  }, []);

  const handleFinish = () => {
    setIsFadingOut(true);
    setTimeout(() => {
      try {
        window.sessionStorage.setItem('synout_splash_shown', 'true');
      } catch {
        // Ignore storage restrictions in sandboxed preview iframes
      }
      onComplete();
    }, 450);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 text-white select-none transition-opacity duration-500 overflow-hidden ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:28px_28px] opacity-15" />
      <div className="absolute w-[600px] h-[600px] rounded-full bg-emerald-500/10 blur-[130px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center text-center px-4 max-w-lg space-y-8">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-36 h-36 rounded-full border border-emerald-500/30 animate-ping opacity-25" />
          <div className="absolute w-44 h-44 rounded-full border border-dashed border-emerald-500/20 animate-spin [animation-duration:18s]" />
          <div className="absolute w-28 h-28 rounded-full border border-emerald-400/30" />

          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-slate-900 to-slate-950 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shadow-[0_0_40px_rgba(16,185,129,0.3)]">
            <Shield className="w-10 h-10 animate-pulse" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono tracking-widest uppercase">
            <Zap className="w-3.5 h-3.5" /> Autonomous Identity Defense
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight font-mono text-white">
            syn<span className="text-emerald-400">OUT</span>
          </h1>
          <p className="text-xs text-slate-400 tracking-wide uppercase font-mono">
            Zero-Footprint Data Broker & Dark Web Exposure Purge Engine
          </p>
        </div>

        <div className="w-full space-y-3">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Activity className="w-3.5 h-3.5 animate-pulse" />
              {steps[stepIndex]}
            </span>
            <span className="tabular-nums font-bold text-white">{progress}%</span>
          </div>

          <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800 p-0.5">
            <div
              className="bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 h-full rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <button
          onClick={handleFinish}
          className="group px-5 py-2.5 rounded-xl bg-slate-900/80 hover:bg-emerald-500/20 border border-slate-800 hover:border-emerald-500/40 text-xs font-mono text-slate-300 hover:text-emerald-300 transition-all flex items-center gap-2 cursor-pointer shadow-lg"
        >
          <span>Enter synOUT</span>
          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
};
