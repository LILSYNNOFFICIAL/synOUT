import React, { useState } from 'react';
import {
  Shield,
  Menu,
  X,
  Mail,
  Building2,
  FileCheck,
  Skull,
  Layers,
  Activity,
  CheckCircle2,
  SearchCode,
  Archive,
  Landmark,
  Flame,
  FileCode2,
} from 'lucide-react';
import { useEmailConnection } from '../services/emailConnectionStore';

export type AppTab =
  | 'home'
  | 'scanner'
  | 'report'
  | 'tracker'
  | 'directory'
  | 'guide'
  | 'darkweb'
  | 'deindex'
  | 'monitoring'
  | 'profiles'
  | 'gmail'
  | 'webforms'
  | 'bureaus'
  | 'firewall';

interface NavbarProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  hasScanResults: boolean;
  exposedCount: number;
  removedCount: number;
  isPoaSigned?: boolean;
  onOpenPowerOfAttorney?: () => void;
  onOpenVault?: () => void;
  onOpenNukeAll?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  hasScanResults,
  exposedCount,
  removedCount,
  isPoaSigned,
  onOpenPowerOfAttorney,
  onOpenVault,
  onOpenNukeAll,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isDirectSendConnected, isAnyEmailConnected, activeConnectedEmail } = useEmailConnection();

  const handleNavClick = (tab: AppTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        {/* Brand Wordmark */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => handleNavClick(hasScanResults ? 'report' : 'home')}
            className="flex items-center gap-2 text-left group transition-opacity hover:opacity-90 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
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
        <nav className="hidden xl:flex items-center gap-3.5 2xl:gap-4 text-xs font-medium text-slate-400">
          <button
            onClick={() => handleNavClick('home')}
            className={`transition-colors py-1 cursor-pointer whitespace-nowrap ${
              activeTab === 'home' ? 'text-white border-b-2 border-emerald-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            Overview
          </button>

          <button
            onClick={() => handleNavClick('scanner')}
            className={`transition-colors py-1 cursor-pointer whitespace-nowrap ${
              activeTab === 'scanner' ? 'text-white border-b-2 border-emerald-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            Audit Scan
          </button>

          {hasScanResults && (
            <button
              onClick={() => handleNavClick('report')}
              className={`transition-colors py-1 flex items-center gap-1 cursor-pointer whitespace-nowrap ${
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
            className={`transition-colors py-1 flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              activeTab === 'darkweb' ? 'text-white border-b-2 border-red-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            <Skull className="w-3.5 h-3.5 text-red-400" />
            <span>Dark Web</span>
          </button>

          <button
            onClick={() => handleNavClick('deindex')}
            className={`transition-colors py-1 flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              activeTab === 'deindex' ? 'text-white border-b-2 border-sky-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            <SearchCode className="w-3.5 h-3.5 text-sky-400" />
            <span>De-Index</span>
          </button>

          <button
            onClick={() => handleNavClick('monitoring')}
            className={`transition-colors py-1 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'monitoring' ? 'text-white border-b-2 border-emerald-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>Auto-Removal</span>
          </button>

          <button
            onClick={() => handleNavClick('profiles')}
            className={`transition-colors py-1 flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              activeTab === 'profiles' ? 'text-white border-b-2 border-emerald-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>10 Searches</span>
          </button>

          <button
            onClick={() => handleNavClick('bureaus')}
            className={`transition-colors py-1 flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              activeTab === 'bureaus' ? 'text-white border-b-2 border-amber-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Bureaus</span>
          </button>

          <button
            onClick={() => handleNavClick('firewall')}
            className={`transition-colors py-1 flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              activeTab === 'firewall' ? 'text-white border-b-2 border-emerald-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            <Landmark className="w-3.5 h-3.5 text-emerald-400" />
            <span>Firewall</span>
          </button>

          <button
            onClick={() => handleNavClick('webforms')}
            className={`transition-colors py-1 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'webforms'
                ? 'text-white border-b-2 border-emerald-400 font-semibold'
                : 'hover:text-slate-200'
            }`}
            title="Discover disguised opt-out pages & auto-fill broker removal forms"
          >
            <FileCode2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Web Forms</span>
          </button>

          <button
            onClick={() => handleNavClick('gmail')}
            className={`transition-colors py-1 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'gmail' ? 'text-white border-b-2 border-emerald-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            {isAnyEmailConnected ? (
              <CheckCircle2
                className={`w-3.5 h-3.5 ${isDirectSendConnected ? 'text-emerald-400' : 'text-sky-400'}`}
              />
            ) : (
              <Mail className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>Email</span>
          </button>

          {hasScanResults && (
            <button
              onClick={() => handleNavClick('tracker')}
              className={`transition-colors py-1 flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                activeTab === 'tracker' ? 'text-white border-b-2 border-emerald-400 font-semibold' : 'hover:text-slate-200'
              }`}
            >
              <span>SLA Tracker</span>
              {removedCount > 0 && (
                <span className="text-[10px] font-mono tabular-nums text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                  {removedCount}
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => handleNavClick('directory')}
            className={`transition-colors py-1 cursor-pointer whitespace-nowrap ${
              activeTab === 'directory' ? 'text-white border-b-2 border-emerald-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            700+ Brokers
          </button>
        </nav>

        {/* Right CTA */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => handleNavClick('gmail')}
            title={
              isAnyEmailConnected && activeConnectedEmail
                ? `Connected sender: ${activeConnectedEmail}`
                : 'Connect your email to send opt-out demands'
            }
            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer max-w-[180px] ${
              isDirectSendConnected
                ? 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40 hover:bg-emerald-950/70'
                : isAnyEmailConnected
                ? 'bg-sky-950/50 text-sky-300 border-sky-500/40 hover:bg-sky-950/70'
                : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-emerald-500/40 hover:text-white'
            }`}
          >
            {isAnyEmailConnected && activeConnectedEmail ? (
              <>
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isDirectSendConnected ? 'bg-emerald-400' : 'bg-sky-400'
                  }`}
                />
                <span className="truncate font-mono">{activeConnectedEmail}</span>
              </>
            ) : (
              <>
                <Mail className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="whitespace-nowrap">Connect Email</span>
              </>
            )}
          </button>

          {onOpenVault && (
            <button
              type="button"
              onClick={onOpenVault}
              title="Encrypted Local Workspace Vault & Scan Snapshots"
              className="hidden lg:flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-700 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Archive className="w-3.5 h-3.5 text-emerald-400" />
              <span>Vault</span>
            </button>
          )}

          {onOpenPowerOfAttorney && (
            <button
              onClick={onOpenPowerOfAttorney}
              className={`hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap ${
                isPoaSigned
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40'
                  : 'bg-amber-950/40 text-amber-300 border-amber-500/40'
              }`}
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>{isPoaSigned ? 'POA' : 'Sign POA'}</span>
            </button>
          )}

          {onOpenNukeAll && (
            <button
              type="button"
              onClick={onOpenNukeAll}
              title="Mass-email all data brokers, people-search websites, and clearinghouses to delete your data"
              className="px-3.5 py-2 rounded-xl text-xs font-extrabold text-white bg-red-600 hover:bg-red-500 border border-red-400/30 shadow-lg shadow-red-600/20 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Flame className="w-3.5 h-3.5" />
              <span>NUKE ALL</span>
            </button>
          )}

          <button
            onClick={() => handleNavClick('scanner')}
            className="hidden sm:inline-flex px-3.5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-emerald-500 hover:bg-emerald-400 transition-all cursor-pointer whitespace-nowrap"
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
        <div className="xl:hidden border-b border-slate-800 bg-slate-950/98 px-4 py-4 space-y-1.5 text-xs">
          {onOpenNukeAll && (
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenNukeAll();
              }}
              className="w-full p-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold flex items-center justify-center gap-2 cursor-pointer mb-2"
            >
              <Flame className="w-4 h-4" />
              <span>NUKE ALL — Mass Email Brokers &amp; Websites</span>
            </button>
          )}
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
          {hasScanResults && (
            <button onClick={() => handleNavClick('tracker')} className="w-full text-left p-2.5 rounded-lg text-emerald-300 hover:bg-slate-900">
              45-Day Statutory SLA &amp; Removal Tracker ({removedCount} Scrubbed)
            </button>
          )}
          <button onClick={() => handleNavClick('darkweb')} className="w-full text-left p-2.5 rounded-lg text-red-400 hover:bg-slate-900">
            Dark Web &amp; Tor Threat Neutralization
          </button>
          <button onClick={() => handleNavClick('deindex')} className="w-full text-left p-2.5 rounded-lg text-sky-400 hover:bg-slate-900">
            Search Engine De-Indexing (Google / Bing / DuckDuckGo)
          </button>
          <button onClick={() => handleNavClick('monitoring')} className="w-full text-left p-2.5 rounded-lg text-emerald-400 hover:bg-slate-900">
            Continuous Auto-Removal Engine
          </button>
          <button onClick={() => handleNavClick('profiles')} className="w-full text-left p-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900">
            Search Profiles Quota (10 Slots)
          </button>
          <button onClick={() => handleNavClick('bureaus')} className="w-full text-left p-2.5 rounded-lg text-amber-400 hover:bg-slate-900">
            Specialty Bureaus, Telco CNAM &amp; Marketing Registries
          </button>
          <button onClick={() => handleNavClick('firewall')} className="w-full text-left p-2.5 rounded-lg text-emerald-300 hover:bg-slate-900">
            Public Records, Canary Aliases &amp; ID/EXIF Firewall
          </button>
          <button
            onClick={() => handleNavClick('webforms')}
            className="w-full text-left p-2.5 rounded-lg text-emerald-300 hover:bg-slate-900"
          >
            Opt-Out Page Finder &amp; Web Form Auto-Fill
          </button>
          <button onClick={() => handleNavClick('gmail')} className="w-full text-left p-2.5 rounded-lg text-emerald-400 hover:bg-slate-900">
            {isAnyEmailConnected && activeConnectedEmail
              ? `Email Connected (${activeConnectedEmail})`
              : 'Email Dispatch (Connect Gmail / Outlook / Any Email)'}
          </button>
          <button onClick={() => handleNavClick('directory')} className="w-full text-left p-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900">
            700+ Data Broker Directory
          </button>
          <button onClick={() => handleNavClick('guide')} className="w-full text-left p-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900">
            CCPA / TDPSA / GPC Signal Guide
          </button>
          {onOpenVault && (
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenVault();
              }}
              className="w-full text-left p-2.5 rounded-lg text-emerald-300 hover:bg-slate-900"
            >
              Encrypted Workspace Vault (Backup / Restore)
            </button>
          )}
        </div>
      )}
    </header>
  );
};
