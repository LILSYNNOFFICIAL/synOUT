import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bot,
  Download,
  Lock,
  Network,
  PhoneOff,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { DataBroker, ScanResult } from '../types';
import { AppTab } from './Navbar';
import { getExhaustiveBrokerRegistry } from '../utils/dynamicBrokerRegistry';
import { inspectBrowserPrivacySignals } from '../utils/browserPrivacyInspector';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  scanResults: ScanResult[];
  hasScanResults: boolean;
  onNavigateTab: (tab: AppTab) => void;
  onOpenWebFormBroker: (broker: DataBroker) => void;
  onSendBrokerOptOut: (broker: DataBroker) => void;
  onOpenVault: () => void;
  onOpenPowerOfAttorney: () => void;
  onOpenNukeAll?: () => void;
}

interface PaletteCommandItem {
  id: string;
  group: 'Workspace' | 'Quick Action' | 'Data Broker';
  title: string;
  subtitle: string;
  statusTag?: string;
  onSelect: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  scanResults,
  hasScanResults,
  onNavigateTab,
  onOpenWebFormBroker,
  onSendBrokerOptOut,
  onOpenVault,
  onOpenPowerOfAttorney,
  onOpenNukeAll,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [showPrivacyInspector, setShowPrivacyInspector] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const privacyReport = useMemo(() => inspectBrowserPrivacySignals(), [isOpen]);

  const resultMap = useMemo(
    () => new Map<string, ScanResult>(scanResults.map((r) => [r.brokerId, r])),
    [scanResults]
  );

  const allItems = useMemo<PaletteCommandItem[]>(() => {
    const navItems: PaletteCommandItem[] = [
      {
        id: 'nav-scanner',
        group: 'Workspace',
        title: 'Run Identity & Broker Exposure Audit',
        subtitle: 'Scan 10 identity, phone, email, property, and dark-web vectors',
        onSelect: () => {
          onNavigateTab('scanner');
          onClose();
        },
      },
      {
        id: 'nav-report',
        group: 'Workspace',
        title: 'Exposure Report & Geo Map',
        subtitle: 'Inspect matched broker listings, D3 score trends, and Quick Fix suggestions',
        onSelect: () => {
          onNavigateTab('report');
          onClose();
        },
      },
      {
        id: 'nav-supplychain',
        group: 'Workspace',
        title: 'Upstream Supply-Chain & Cascade Graph',
        subtitle: 'Map wholesale clearinghouses feeding downstream people-search mirrors',
        onSelect: () => {
          onNavigateTab('supplychain');
          onClose();
        },
      },
      {
        id: 'nav-creditfreeze',
        group: 'Workspace',
        title: 'Credit Freeze, Fraud Alert & Identity Lockout Center',
        subtitle: 'FCRA § 605A freezes across Equifax, Experian, TransUnion, Innovis, ChexSystems, NCTUE & IRS',
        onSelect: () => {
          onNavigateTab('creditfreeze');
          onClose();
        },
      },
      {
        id: 'nav-tcpa',
        group: 'Workspace',
        title: 'Robocall, Spam Text & TCPA Do-Not-Contact Shield',
        subtitle: 'National/State DNC lists, 47 CFR § 64.1200 consent revocation & $500/$1,500 violation ledger',
        onSelect: () => {
          onNavigateTab('tcpa');
          onClose();
        },
      },
      {
        id: 'nav-webforms',
        group: 'Workspace',
        title: 'Online Forms Auto-Remove Workbench',
        subtitle: 'Auto-populate criteria & check required statutory consent boxes without a server',
        onSelect: () => {
          onNavigateTab('webforms');
          onClose();
        },
      },
      {
        id: 'nav-gmail',
        group: 'Workspace',
        title: 'Email Removal Dispatch Center',
        subtitle: 'Connect Google OAuth, 1-Click Webmail, or 2-Step App Code for statutory notices',
        onSelect: () => {
          onNavigateTab('gmail');
          onClose();
        },
      },
      {
        id: 'nav-inbox',
        group: 'Workspace',
        title: 'Inbox Confirmation Harvester',
        subtitle: 'Extract & safely complete one-time broker email verification links',
        onSelect: () => {
          onNavigateTab('inbox');
          onClose();
        },
      },
      {
        id: 'nav-tracker',
        group: 'Workspace',
        title: '45-Day Statutory SLA Tracker',
        subtitle: 'Monitor pending opt-outs, overdue cure notices, and reply triage',
        onSelect: () => {
          onNavigateTab('tracker');
          onClose();
        },
      },
      {
        id: 'nav-monitoring',
        group: 'Workspace',
        title: 'Continuous 30/60/90-Day Re-Listing Monitor',
        subtitle: 'Detect resurfaced records and clean-broker leaks automatically',
        onSelect: () => {
          onNavigateTab('monitoring');
          onClose();
        },
      },
      {
        id: 'nav-registries',
        group: 'Workspace',
        title: 'State Data Broker Registries & Regulator Packets',
        subtitle: 'CA CPPA, TX, OR & VT statutory registries and SHA-256 complaint exports',
        onSelect: () => {
          onNavigateTab('registries');
          onClose();
        },
      },
      {
        id: 'nav-firewall',
        group: 'Workspace',
        title: 'Public Records Firewall, Canary Aliases & EXIF/ID Scrubber',
        subtitle: 'County assessor redaction petitions, leak-attribution aliases, and metadata stripper',
        onSelect: () => {
          onNavigateTab('firewall');
          onClose();
        },
      },
      {
        id: 'nav-deindex',
        group: 'Workspace',
        title: 'Search Engine De-Indexing Center',
        subtitle: 'Purge stale Google, Bing, and DuckDuckGo cached snippets',
        onSelect: () => {
          onNavigateTab('deindex');
          onClose();
        },
      },
      {
        id: 'nav-darkweb',
        group: 'Workspace',
        title: 'Dark Web & Breach Takedown Center',
        subtitle: 'Inspect breach exposures and generate abuse/host takedown notices',
        onSelect: () => {
          onNavigateTab('darkweb');
          onClose();
        },
      },
      {
        id: 'act-vault',
        group: 'Quick Action',
        title: 'Open AES-256-GCM Encrypted Workspace Vault',
        subtitle: 'Export or restore zero-knowledge PBKDF2 encrypted workspace backups',
        onSelect: () => {
          onClose();
          onOpenVault();
        },
      },
      {
        id: 'act-poa',
        group: 'Quick Action',
        title: 'Sign Authorized Agent Power of Attorney',
        subtitle: 'Attach formal consumer agent authorization to statutory deletion demands',
        onSelect: () => {
          onClose();
          onOpenPowerOfAttorney();
        },
      },
    ];

    if (hasScanResults && onOpenNukeAll) {
      navItems.unshift({
        id: 'act-nuke-all',
        group: 'Quick Action',
        title: 'Launch NUKE ALL Mass Suppression',
        subtitle: 'Batch-remove exposed listings across web forms and statutory email channels',
        statusTag: 'Mass Action',
        onSelect: () => {
          onClose();
          onOpenNukeAll();
        },
      });
    }

    const brokers = getExhaustiveBrokerRegistry();
    const brokerItems: PaletteCommandItem[] = brokers.map((b) => {
      const scanMatch = resultMap.get(b.id);
      const statusLabel =
        scanMatch?.removalStatus === 'removed'
          ? 'Suppressed'
          : scanMatch?.removalStatus === 'submitted'
          ? 'Pending'
          : scanMatch?.status === 'exposed'
          ? 'Exposed'
          : b.risk;

      const isWebFormPrimary =
        b.emailDeliverability === 'web_form_only' || b.removalMethod === 'Online Form';

      return {
        id: `broker-${b.id}`,
        group: 'Data Broker',
        title: `${b.name} (${b.domain})`,
        subtitle: isWebFormPrimary
          ? `Auto-Fill Web Form · ${b.category}`
          : `Statutory Opt-Out (${b.privacyEmail || b.optOutUrl}) · ${b.category}`,
        statusTag: statusLabel,
        onSelect: () => {
          onClose();
          if (isWebFormPrimary) {
            onOpenWebFormBroker(b);
          } else {
            onSendBrokerOptOut(b);
          }
        },
      };
    });

    return [...navItems, ...brokerItems];
  }, [
    hasScanResults,
    onClose,
    onNavigateTab,
    onOpenNukeAll,
    onOpenPowerOfAttorney,
    onOpenVault,
    onOpenWebFormBroker,
    onSendBrokerOptOut,
    resultMap,
  ]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems.slice(0, 18);
    return allItems
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q) ||
          item.group.toLowerCase().includes(q)
      )
      .slice(0, 25);
  }, [allItems, query]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setShowPrivacyInspector(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 20);
    }
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (showPrivacyInspector) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) =>
        filteredItems.length === 0 ? 0 : (prev + 1) % filteredItems.length
      );
    } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
      setActiveIndex((prev) =>
        filteredItems.length === 0
          ? 0
          : (prev - 1 + filteredItems.length) % filteredItems.length
      );
    } else if (e.key === 'Enter' && filteredItems[activeIndex]) {
      e.preventDefault();
      filteredItems[activeIndex].onSelect();
    }
  };

  const handleDownloadGpcAudit = () => {
    if (typeof document === 'undefined') return;
    const blob = new Blob([JSON.stringify(privacyReport, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `synout-browser-gpc-audit-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick Jump Command Palette and Browser Privacy Signal Inspector"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-start justify-center pt-14 sm:pt-20 px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-panel rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-white/[0.12]"
      >
        {/* Top Search & Mode Header */}
        <div className="p-4 border-b border-white/[0.08] flex items-center gap-3">
          <Search className="w-4 h-4 text-emerald-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (showPrivacyInspector) setShowPrivacyInspector(false);
            }}
            placeholder="Jump to any workspace, Credit Freeze, Supply-Chain Graph, or search 70+ brokers..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPrivacyInspector((v) => !v)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              showPrivacyInspector
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'bg-white/[0.06] hover:bg-white/[0.12] text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {privacyReport.gpcEnabled ? 'Sec-GPC: Active' : 'Inspect Browser GPC'}
            </span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close command palette"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {showPrivacyInspector ? (
          <div className="p-5 sm:p-6 space-y-4 max-h-[65vh] overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <h2 className="text-base font-bold text-white">
                  Live Browser Privacy &amp; Global Privacy Control (Sec-GPC) Audit
                </h2>
                <p className="text-xs text-slate-400 tabular-nums">
                  {privacyReport.protectedCount} of {privacyReport.totalChecks} browser signals
                  hardened · Checked locally with zero network telemetry
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadGpcAudit}
                className="px-3 py-1.5 rounded-xl glass-subtle hover:border-white/20 text-xs font-semibold text-slate-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export Audit (.json)</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {privacyReport.signals.map((sig) => (
                <div
                  key={sig.id}
                  className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/[0.07] space-y-1.5 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-white">{sig.label}</span>
                    <span
                      className={`font-mono ${
                        sig.status === 'protected'
                          ? 'text-emerald-400'
                          : sig.status === 'attention'
                          ? 'text-amber-300'
                          : 'text-sky-300'
                      }`}
                    >
                      {sig.detectedValue}
                    </span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">{sig.explanation}</p>
                  <p className="text-slate-200 leading-relaxed">
                    <span className="text-emerald-400 font-semibold">Action: </span>
                    {sig.remediationTip}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Quick Shortcut Bar */}
            <div className="px-4 py-2.5 bg-slate-950/50 border-b border-white/[0.06] flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  onNavigateTab('supplychain');
                  onClose();
                }}
                className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Network className="w-3.5 h-3.5 text-emerald-400" />
                <span>Supply-Chain Graph</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onNavigateTab('creditfreeze');
                  onClose();
                }}
                className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Lock className="w-3.5 h-3.5 text-sky-400" />
                <span>Credit Freeze Center</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onNavigateTab('tcpa');
                  onClose();
                }}
                className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <PhoneOff className="w-3.5 h-3.5 text-amber-300" />
                <span>Robocall &amp; TCPA Shield</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onNavigateTab('webforms');
                  onClose();
                }}
                className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Bot className="w-3.5 h-3.5 text-emerald-400" />
                <span>Auto-Fill Forms</span>
              </button>
            </div>

            {/* Filtered Command Results */}
            <div className="max-h-96 overflow-y-auto p-2 space-y-1">
              {filteredItems.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  No matching workspaces or data brokers for &ldquo;{query}&rdquo;.
                </div>
              ) : (
                filteredItems.map((item, idx) => {
                  const isActive = idx === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={item.onSelect}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        isActive ? 'bg-emerald-500/15 text-white' : 'hover:bg-white/[0.05] text-slate-200'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-[11px] text-slate-500">{item.group}</span>
                          <span aria-hidden="true" className="text-slate-600">
                            ·
                          </span>
                          <span className="font-semibold text-white truncate">{item.title}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">
                          {item.subtitle}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 text-xs">
                        {item.statusTag && (
                          <span
                            className={`font-mono text-[11px] ${
                              item.statusTag === 'Exposed'
                                ? 'text-rose-400 font-semibold'
                                : item.statusTag === 'Suppressed'
                                ? 'text-emerald-400 font-semibold'
                                : item.statusTag === 'Pending'
                                ? 'text-amber-300'
                                : 'text-slate-400'
                            }`}
                          >
                            {item.statusTag}
                          </span>
                        )}
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-slate-400">
              <span>Navigate with ↑ ↓ · Open with Enter · Close with Esc</span>
              <span className="font-mono">Ctrl+K / ⌘K</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
