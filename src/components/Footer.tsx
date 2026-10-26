import React, { useState } from 'react';
import { Trash2, Archive } from 'lucide-react';
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
    <footer className="border-t border-white/[0.07] bg-slate-950/50 backdrop-blur-xl py-8 px-4 text-xs text-slate-400">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <span className="font-bold text-white tracking-tight">synOUT</span>
          <span aria-hidden="true" className="text-slate-700">·</span>
          <span className="text-[11px] text-slate-500">
            Autonomous Personal Data Removal &amp; Statutory Enforcement
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-5 text-[11px] font-medium text-slate-400">
          <button type="button" onClick={() => onNavigate('scanner')} className="hover:text-white transition-colors cursor-pointer whitespace-nowrap">
            Audit Scan
          </button>
          <button type="button" onClick={() => onNavigate('webforms')} className="hover:text-white transition-colors cursor-pointer whitespace-nowrap">
            Web Forms
          </button>
          <button type="button" onClick={() => onNavigate('inbox')} className="hover:text-white transition-colors cursor-pointer whitespace-nowrap">
            Inbox Harvester
          </button>
          <button type="button" onClick={() => onNavigate('monitoring')} className="hover:text-white transition-colors cursor-pointer whitespace-nowrap">
            Re-Listing Monitor
          </button>
          <button type="button" onClick={() => onNavigate('registries')} className="hover:text-white transition-colors cursor-pointer whitespace-nowrap">
            State Registries
          </button>
          <button type="button" onClick={() => onNavigate('directory')} className="hover:text-white transition-colors cursor-pointer whitespace-nowrap">
            Broker Directory
          </button>
          <button type="button" onClick={() => onNavigate('guide')} className="hover:text-white transition-colors cursor-pointer whitespace-nowrap">
            Statutory Guide
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-500">
          {onOpenVault && (
            <button
              type="button"
              onClick={onOpenVault}
              className="inline-flex items-center gap-1.5 text-slate-400 hover:text-emerald-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Workspace Vault</span>
            </button>
          )}

          {onPurgeSession && (
            confirmPurge ? (
              <div className="inline-flex items-center gap-2 glass-subtle rounded-lg px-2.5 py-1 text-slate-300">
                <span>Wipe session &amp; local data?</span>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmPurge(false);
                    onPurgeSession();
                  }}
                  className="text-rose-400 hover:text-rose-300 font-semibold cursor-pointer whitespace-nowrap"
                >
                  Confirm Wipe
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmPurge(false)}
                  className="text-slate-400 hover:text-white cursor-pointer whitespace-nowrap"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmPurge(true)}
                className="inline-flex items-center gap-1.5 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Purge Session</span>
              </button>
            )
          )}
          <span className="tabular-nums">&copy; {new Date().getFullYear()} synOUT</span>
        </div>
      </div>
    </footer>
  );
};
