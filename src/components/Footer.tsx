import React from 'react';
import { Shield, Lock, Scale, Heart } from 'lucide-react';
import { AppTab } from './Navbar';

interface FooterProps {
  onNavigate: (tab: AppTab) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="border-t border-slate-800/80 bg-slate-950 py-12 px-4 text-xs text-slate-400">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <span className="font-mono font-bold text-white tracking-tight">synOUT Privacy Technologies</span>
            <p className="text-[11px] text-slate-500">Autonomous Clear Web & Dark Web Data Exposure Defense</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 text-[11px] font-medium text-slate-400">
          <button onClick={() => onNavigate('home')} className="hover:text-white transition-colors cursor-pointer">
            Overview
          </button>
          <button onClick={() => onNavigate('scanner')} className="hover:text-white transition-colors cursor-pointer">
            Deep Scan
          </button>
          <button onClick={() => onNavigate('bureaus')} className="hover:text-white transition-colors cursor-pointer">
            Specialty Bureaus
          </button>
          <button onClick={() => onNavigate('directory')} className="hover:text-white transition-colors cursor-pointer">
            700+ Data Brokers
          </button>
          <button onClick={() => onNavigate('guide')} className="hover:text-white transition-colors cursor-pointer">
            CCPA / TDPSA Guide
          </button>
        </div>

        <div className="text-[11px] text-slate-500 text-center md:text-right">
          <span>&copy; {new Date().getFullYear()} synOUT. End-to-end client-side privacy architecture.</span>
        </div>
      </div>
    </footer>
  );
};
