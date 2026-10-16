import React, { useState } from 'react';
import {
  Shield,
  Sparkles,
  Menu,
  X,
  FileText,
  Database,
  BookOpen,
  Mail,
  Fingerprint,
  Zap,
  Building2,
  Lock,
  FileCheck,
  Skull,
  Layers,
  Activity
} from 'lucide-react';

export type AppTab =
  | 'home'
  | 'scanner'
  | 'report'
  | 'tracker'
  | 'directory'
  | 'guide'
  | 'darkweb'
  | 'monitoring'
  | 'profiles'
  | 'gmail'
  | 'bureaus';

interface NavbarProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  hasScanResults: boolean;
  exposedCount: number;
  removedCount: number;
  isPoaSigned?: boolean;
  onOpenPowerOfAttorney?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  hasScanResults,
  exposedCount,
  removedCount,
  isPoaSigned,
  onOpenPowerOfAttorney,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (tab: AppTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Wordmark */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleNavClick(hasScanResults ? 'report' : 'home')}
            className="flex items-center gap-2.5 text-left group transition-opacity hover:opacity-90 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5 font-mono">
                syn<span className="text-emerald-400">OUT</span>
                <span className="text-[10px] font-mono tracking-normal text-emerald-400 font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                  2.0
                </span>
              </span>
            </div>
          </button>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden xl:flex items-center gap-5 text-xs font-medium text-slate-400">
          <button
            onClick={() => handleNavClick('home')}
            className={`transition-colors py-1 cursor-pointer ${
              activeTab === 'home' ? 'text-white border-b-2 border-emerald-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            Overview
          </button>

          <button
            onClick={() => handleNavClick('scanner')}
            className={`transition-colors py-1 cursor-pointer ${
              activeTab === 'scanner' ? 'text-white border-b-2 border-emerald-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            Audit Scan
          </button>

          {hasScanResults && (
            <button
              onClick={() => handleNavClick('report')}
              className={`transition-colors py-1 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'report' ? 'text-white border-b-2 border-emerald-400 font-semibold' : 'hover:text-slate-200'
              }`}
            >
              <span>Exposures</span>
              {exposedCount > 0 && (
                <span className="text-[10px] font-mono tabular-nums text-rose-400 bg-rose-500/10 px-1.5 py-0.2 rounded border border-rose-500/20">
                  {exposedCount}
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => handleNavClick('darkweb')}
            className={`transition-colors py-1 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'darkweb' ? 'text-white border-b-2 border-red-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            <Skull className="w-3.5 h-3.5 text-red-400" />
            <span>Dark Web</span>
          </button>

          <button
            onClick={() => handleNavClick('monitoring')}
            className={`transition-colors py-1 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'monitoring' ? 'text-white border-b-2 border-emerald-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Auto-Removal</span>
          </button>

          <button
            onClick={() => handleNavClick('profiles')}
            className={`transition-colors py-1 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'profiles' ? 'text-white border-b-2 border-emerald-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>10 Searches</span>
          </button>

          <button
            onClick={() => handleNavClick('bureaus')}
            className={`transition-colors py-1 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'bureaus' ? 'text-white border-b-2 border-amber-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Specialty Bureaus</span>
          </button>

          {hasScanResults && (
            <button
              onClick={() => handleNavClick('gmail')}
              className={`transition-colors py-1 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'gmail' ? 'text-white border-b-2 border-red-400 font-semibold' : 'hover:text-slate-200'
              }`}
            >
              <Mail className="w-3.5 h-3.5 text-red-400" />
              <span>Gmail API</span>
            </button>
          )}

          {hasScanResults && (
            <button
              onClick={() => handleNavClick('tracker')}
              className={`transition-colors py-1 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'tracker' ? 'text-white border-b-2 border-emerald-400 font-semibold' : 'hover:text-slate-200'
              }`}
            >
              <span>Tracker</span>
              {removedCount > 0 && (
                <span className="text-[10px] font-mono tabular-nums text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                  {removedCount}
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => handleNavClick('directory')}
            className={`transition-colors py-1 cursor-pointer ${
              activeTab === 'directory' ? 'text-white border-b-2 border-emerald-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            700+ Brokers
          </button>
        </nav>

        {/* Right CTA */}
        <div className="flex items-center gap-2.5">
          {onOpenPowerOfAttorney && (
            <button
              onClick={onOpenPowerOfAttorney}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                isPoaSigned
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40'
                  : 'bg-amber-950/40 text-amber-300 border-amber-500/40 animate-pulse'
              }`}
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>{isPoaSigned ? 'POA Active' : 'Sign POA'}</span>
            </button>
          )}

          <button
            onClick={() => handleNavClick('scanner')}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-emerald-500 hover:bg-emerald-400 shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
          >
            Scan Now
          </button>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="xl:hidden p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900 cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="xl:hidden border-b border-slate-800 bg-slate-950/98 px-4 py-4 space-y-2 text-xs">
          <button onClick={() => handleNavClick('home')} className="w-full text-left p-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900">
            Overview
          </button>
          <button onClick={() => handleNavClick('scanner')} className="w-full text-left p-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900">
            Audit Scan
          </button>
          {hasScanResults && (
            <button onClick={() => handleNavClick('report')} className="w-full text-left p-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900">
              Exposures ({exposedCount})
            </button>
          )}
          <button onClick={() => handleNavClick('darkweb')} className="w-full text-left p-2.5 rounded-lg text-red-400 hover:bg-slate-900">
            Dark Web & Tor Threat Neutralization
          </button>
          <button onClick={() => handleNavClick('monitoring')} className="w-full text-left p-2.5 rounded-lg text-emerald-400 hover:bg-slate-900">
            Continuous Auto-Removal Engine
          </button>
          <button onClick={() => handleNavClick('profiles')} className="w-full text-left p-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900">
            Search Profiles Quota (10 Slots)
          </button>
          <button onClick={() => handleNavClick('bureaus')} className="w-full text-left p-2.5 rounded-lg text-amber-400 hover:bg-slate-900">
            Specialty Clearinghouses & Bureaus (LexisNexis)
          </button>
          {hasScanResults && (
            <button onClick={() => handleNavClick('gmail')} className="w-full text-left p-2.5 rounded-lg text-red-400 hover:bg-slate-900">
              Gmail 1-by-1 Dispatch Center
            </button>
          )}
          <button onClick={() => handleNavClick('directory')} className="w-full text-left p-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900">
            700+ Data Broker Directory
          </button>
        </div>
      )}
    </header>
  );
};
