import React, { useState } from 'react';
import { Shield, Trash2, Archive } from 'lucide-react';
import { AppTab } from './Navbar';

interface FooterProps {
  onNavigate: (tab: AppTab) => void;
  onPurgeSession?: () => void;
  onOpenVault?: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onNavigate,
  onPurgeSession,
  onOpenVault,
}) => {
  const [confirmPurge, setConfirmPurge] = useState(false);

  return (
    <footer className="border-t border-slate-800/80 bg-slate-950 py-10 px-4 text-xs text-slate-400">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <span className="font-mono font-bold text-white tracking-tight">synOUT Privacy Technologies</span>
            <p className="text-[11px] text-slate-500">Clear Web, Search Snippet &amp; Dark Web Data Exposure Defense</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-5 text-[11px] font-medium text-slate-400">
          <button onClick={() => onNavigate('home')} className="hover:text-white transition-colors cursor-pointer">
            Overview
          </button>
          <button onClick={() => onNavigate('scanner')} className="hover:text-white transition-colors cursor-pointer">
            Deep Scan
          </button>
          <button onClick={() => onNavigate('deindex')} className="hover:text-white transition-colors cursor-pointer">
            Search De-Indexing
          </button>
          <button onClick={() => onNavigate('gmail')} className="hover:text-white transition-colors cursor-pointer">
            Email Dispatch
          </button>
          <button onClick={() => onNavigate('bureaus')} className="hover:text-white transition-colors cursor-pointer">
            Specialty Bureaus
          </button>
          <button onClick={() => onNavigate('firewall')} className="hover:text-white transition-colors cursor-pointer">
            Records &amp; Canaries
          </button>
          <button onClick={() => onNavigate('directory')} className="hover:text-white transition-colors cursor-pointer">
            700+ Data Brokers
          </button>
          <button onClick={() => onNavigate('guide')} className="hover:text-white transition-colors cursor-pointer">
            CCPA / GPC Guide
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-500">
          {onOpenVault && (
            <button
              type="button"
              onClick={onOpenVault}
              className="inline-flex items-center gap-1 text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Workspace Vault</span>
            </button>
          )}

          {onPurgeSession && (
            confirmPurge ? (
              <div className="inline-flex items-center gap-2 bg-slate-900 border border-rose-500/30 rounded-lg px-2.5 py-1 text-slate-300">
                <span>Wipe saved profile &amp; email session?</span>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmPurge(false);
                    onPurgeSession();
                  }}
                  className="text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
                >
                  Confirm Wipe
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmPurge(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmPurge(true)}
                className="inline-flex items-center gap-1 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Purge Session Data</span>
              </button>
            )
          )}
          <span>&copy; {new Date().getFullYear()} synOUT.</span>
        </div>
      </div>
    </footer>
  );
};
