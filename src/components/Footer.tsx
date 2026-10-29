import React, { useState } from 'react';
import { Trash2, Archive, BookOpen } from 'lucide-react';
import { AppTab } from './Navbar';

interface FooterProps {
  activeTab?: AppTab;
  onNavigate: (tab: AppTab) => void;
  onPurgeSession?: () => void;
  onOpenVault?: () => void;
  onOpenTutorial?: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  activeTab,
  onNavigate,
  onPurgeSession,
  onOpenVault,
  onOpenTutorial,
}) => {
  const [confirmPurge, setConfirmPurge] = useState(false);

  return (
    <footer
      aria-label="Global Footer"
      className="border-t border-white/[0.07] bg-slate-950/60 backdrop-blur-xl py-8 px-4 sm:px-6 text-xs text-slate-400"
    >
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-5">
          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2.5">
            <span className="font-bold text-white tracking-tight">synOUT</span>
            <span aria-hidden="true" className="text-slate-700">
              ·
            </span>
            <span className="text-[11px] text-slate-400 text-center sm:text-left">
              Personal Data Exposure Audits &amp; Statutory Opt-Out Workspace
            </span>
          </div>

          {/* Primary Legal & Support Links: Privacy, Terms, Contact */}
          <nav
            aria-label="Legal and Contact Links"
            className="flex flex-wrap items-center justify-center gap-5 sm:gap-6 text-xs font-semibold"
          >
            <button
              type="button"
              onClick={() => onNavigate('privacy')}
              aria-current={activeTab === 'privacy' ? 'page' : undefined}
              className={`min-h-[40px] sm:min-h-[36px] px-2 inline-flex items-center transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-lg ${
                activeTab === 'privacy'
                  ? 'text-emerald-300 underline decoration-emerald-400 underline-offset-4'
                  : 'text-slate-200 hover:text-emerald-300'
              }`}
            >
              Privacy
            </button>
            <button
              type="button"
              onClick={() => onNavigate('terms')}
              aria-current={activeTab === 'terms' ? 'page' : undefined}
              className={`min-h-[40px] sm:min-h-[36px] px-2 inline-flex items-center transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-lg ${
                activeTab === 'terms'
                  ? 'text-emerald-300 underline decoration-emerald-400 underline-offset-4'
                  : 'text-slate-200 hover:text-emerald-300'
              }`}
            >
              Terms
            </button>
            <button
              type="button"
              onClick={() => onNavigate('contact')}
              aria-current={activeTab === 'contact' ? 'page' : undefined}
              className={`min-h-[40px] sm:min-h-[36px] px-2 inline-flex items-center transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-lg ${
                activeTab === 'contact'
                  ? 'text-emerald-300 underline decoration-emerald-400 underline-offset-4'
                  : 'text-slate-200 hover:text-emerald-300'
              }`}
            >
              Contact
            </button>

            {onOpenTutorial && (
              <button
                type="button"
                onClick={onOpenTutorial}
                className="min-h-[40px] sm:min-h-[36px] px-2 inline-flex items-center gap-1.5 text-slate-300 hover:text-emerald-300 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-lg font-medium"
              >
                <BookOpen className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Tutorial</span>
              </button>
            )}
          </nav>

          <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-500">
            {onOpenVault && (
              <button
                type="button"
                onClick={onOpenVault}
                className="min-h-[36px] inline-flex items-center gap-1.5 text-slate-400 hover:text-emerald-300 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>Workspace Vault</span>
              </button>
            )}

            {onPurgeSession &&
              (confirmPurge ? (
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
                  className="min-h-[36px] inline-flex items-center gap-1.5 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Purge Session</span>
                </button>
              ))}
            <span className="tabular-nums">&copy; {new Date().getFullYear()} synOUT</span>
          </div>
        </div>

        {/* Workspace Quick Shortcuts Row */}
        <div className="pt-4 border-t border-white/[0.05] flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] font-medium text-slate-400">
          <button
            type="button"
            onClick={() => onNavigate('scanner')}
            className="hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            Audit Scan
          </button>
          <button
            type="button"
            onClick={() => onNavigate('webforms')}
            className="hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            Web Forms
          </button>
          <button
            type="button"
            onClick={() => onNavigate('inbox')}
            className="hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            Inbox Harvester
          </button>
          <button
            type="button"
            onClick={() => onNavigate('monitoring')}
            className="hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            Re-Listing Monitor
          </button>
          <button
            type="button"
            onClick={() => onNavigate('registries')}
            className="hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            State Registries
          </button>
          <button
            type="button"
            onClick={() => onNavigate('directory')}
            className="hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            Broker Directory
          </button>
          <button
            type="button"
            onClick={() => onNavigate('guide')}
            className="hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            Statutory Guide
          </button>
        </div>
      </div>
    </footer>
  );
};

