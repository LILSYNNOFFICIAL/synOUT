import React, { useState, useRef, useEffect } from 'react';
import {
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
  ChevronDown,
  Inbox,
  Scale,
  Search,
  LayoutDashboard,
  ShieldAlert,
  Clock,
  BookOpen,
  Globe,
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
  | 'firewall'
  | 'inbox'
  | 'registries';

export type NavCategoryId =
  | 'discovery'
  | 'suppression'
  | 'monitoring'
  | 'registries'
  | 'workspace';

export interface NavCompartmentItem {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  tab?: AppTab;
  action?: 'nuke' | 'vault' | 'poa';
  badgeCount?: number;
  icon: React.ComponentType<{ className?: string }>;
}

export interface NavCategoryCompartment {
  id: NavCategoryId;
  label: string;
  summary: string;
  items: NavCompartmentItem[];
}

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

export function buildNavCompartments(params: {
  hasScanResults?: boolean;
  exposedCount: number;
  removedCount: number;
  isPoaSigned?: boolean;
  activeConnectedEmail?: string | null;
}): NavCategoryCompartment[] {
  const {
    hasScanResults = params.exposedCount > 0 || params.removedCount > 0,
    exposedCount,
    removedCount,
    isPoaSigned,
    activeConnectedEmail,
  } = params;

  return [
    {
      id: 'discovery',
      label: 'Discovery',
      summary: 'Exposure audits & breach intelligence',
      items: [
        {
          id: 'home',
          label: 'Overview',
          shortLabel: 'Overview',
          description: 'Workspace summary & instant audit launcher',
          tab: 'home',
          icon: LayoutDashboard,
        },
        {
          id: 'scanner',
          label: 'Audit Scan',
          shortLabel: 'Audit Scan',
          description: 'Run 10-vector identity & cross-state exposure scan',
          tab: 'scanner',
          icon: Search,
        },
        {
          id: 'report',
          label: 'Exposure Report',
          shortLabel: 'Exposures',
          description: 'Review matched broker listings & homonym filters',
          tab: 'report',
          badgeCount: exposedCount > 0 ? exposedCount : undefined,
          icon: ShieldAlert,
        },
        {
          id: 'profiles',
          label: 'Saved Searches',
          shortLabel: '10 Searches',
          description: 'Manage up to 10 stored identity search vectors',
          tab: 'profiles',
          icon: Layers,
        },
        {
          id: 'darkweb',
          label: 'Dark Web & Leaks',
          shortLabel: 'Dark Web',
          description: 'Tor archives, stealer logs & host takedowns',
          tab: 'darkweb',
          icon: Skull,
        },
      ],
    },
    {
      id: 'suppression',
      label: 'Suppression',
      summary: 'Done-for-you online forms & legal emails',
      items: [
        {
          id: 'webforms',
          label: 'Online Forms (Done For You)',
          shortLabel: 'Online Forms',
          description: 'Auto-fills opt-out forms & checks consent boxes on your behalf',
          tab: 'webforms',
          icon: FileCode2,
        },
        {
          id: 'gmail',
          label: 'Email Removal (Sent For You)',
          shortLabel: 'Email',
          description: activeConnectedEmail
            ? `Connected sender: ${activeConnectedEmail}`
            : 'Easy 1-click email setup & automatic legal removal emails',
          tab: 'gmail',
          icon: Mail,
        },
        {
          id: 'deindex',
          label: 'Search De-Indexing',
          shortLabel: 'De-Index',
          description: 'Clear old search results from Google, Bing & DuckDuckGo',
          tab: 'deindex',
          icon: SearchCode,
        },
        ...(hasScanResults
          ? [
              {
                id: 'nuke-modal',
                label: 'Mass Suppression (NUKE ALL)',
                shortLabel: 'NUKE ALL',
                description: 'Remove across all online forms & legal emails at once',
                action: 'nuke' as const,
                icon: Flame,
              },
            ]
          : []),
      ],
    },
    {
      id: 'monitoring',
      label: 'Monitoring',
      summary: 'Inbox confirmation & 30/60/90d sweeps',
      items: [
        {
          id: 'inbox',
          label: 'Inbox Harvester',
          shortLabel: 'Inbox Harvester',
          description: 'Auto-extract & complete broker confirmation links',
          tab: 'inbox',
          icon: Inbox,
        },
        {
          id: 'tracker',
          label: '45-Day SLA Tracker',
          shortLabel: 'SLA Tracker',
          description: 'Statutory deadlines, receipts & reply triage',
          tab: 'tracker',
          badgeCount: removedCount > 0 ? removedCount : undefined,
          icon: Clock,
        },
        {
          id: 'monitoring',
          label: 'Re-Listing Monitor',
          shortLabel: 'Re-Listing',
          description: '30/60/90-day live snapshot diffs & auto-re-purge',
          tab: 'monitoring',
          icon: Activity,
        },
      ],
    },
    {
      id: 'registries',
      label: 'Registries',
      summary: 'State registries, bureaus & firewalls',
      items: [
        {
          id: 'directory',
          label: 'Broker Directory',
          shortLabel: 'Brokers',
          description: 'Verified people-search & clearinghouse catalog',
          tab: 'directory',
          icon: Globe,
        },
        {
          id: 'registries',
          label: 'State Registries & Complaints',
          shortLabel: 'State Registries',
          description: 'CA CPPA, TX, OR & VT filings + regulator packets',
          tab: 'registries',
          icon: Scale,
        },
        {
          id: 'bureaus',
          label: 'Specialty Bureaus',
          shortLabel: 'Bureaus',
          description: 'LexisNexis, ChexSystems, NCTUE & Telco CNAM',
          tab: 'bureaus',
          icon: Building2,
        },
        {
          id: 'firewall',
          label: 'Records Firewall',
          shortLabel: 'Firewall',
          description: 'County deeds, canary aliases & ID/EXIF scrubber',
          tab: 'firewall',
          icon: Landmark,
        },
      ],
    },
    {
      id: 'workspace',
      label: 'Workspace',
      summary: 'Legal authority, encrypted vault & guide',
      items: [
        {
          id: 'poa-modal',
          label: isPoaSigned ? 'Power of Attorney (Signed)' : 'Sign Power of Attorney',
          shortLabel: isPoaSigned ? 'POA Signed' : 'Sign POA',
          description: 'Authorize statutory agent representation on notices',
          action: 'poa',
          icon: FileCheck,
        },
        {
          id: 'vault-modal',
          label: 'Encrypted Workspace Vault',
          shortLabel: 'Vault',
          description: 'AES-GCM encrypted backups & snapshot history',
          action: 'vault',
          icon: Archive,
        },
        {
          id: 'guide',
          label: 'Statutory & GPC Guide',
          shortLabel: 'Legal Guide',
          description: 'CCPA, CPRA, TDPSA & Global Privacy Control reference',
          tab: 'guide',
          icon: BookOpen,
        },
      ],
    },
  ];
}

export function resolveCategoryForTab(tab: AppTab): NavCategoryId {
  switch (tab) {
    case 'home':
    case 'scanner':
    case 'report':
    case 'profiles':
    case 'darkweb':
      return 'discovery';
    case 'webforms':
    case 'gmail':
    case 'deindex':
      return 'suppression';
    case 'inbox':
    case 'tracker':
    case 'monitoring':
      return 'monitoring';
    case 'directory':
    case 'registries':
    case 'bureaus':
    case 'firewall':
      return 'registries';
    case 'guide':
      return 'workspace';
  }
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
  const [openCategory, setOpenCategory] = useState<NavCategoryId | null>(null);
  const [pinnedCategory, setPinnedCategory] = useState<NavCategoryId | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navContainerRef = useRef<HTMLDivElement | null>(null);
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinnedCategoryRef = useRef<NavCategoryId | null>(null);
  pinnedCategoryRef.current = pinnedCategory;

  const { isDirectSendConnected, isAnyEmailConnected, activeConnectedEmail } =
    useEmailConnection();

  const [logoLoadError, setLogoLoadError] = useState(false);

  const compartments = buildNavCompartments({
    hasScanResults,
    exposedCount,
    removedCount,
    isPoaSigned,
    activeConnectedEmail,
  });

  const activeCategoryId = resolveCategoryForTab(activeTab);
  const activeCompartment =
    compartments.find((c) => c.id === activeCategoryId) || compartments[0];

  const clearHoverTimers = () => {
    if (hoverCloseTimerRef.current !== null) {
      clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
    if (hoverSwitchTimerRef.current !== null) {
      clearTimeout(hoverSwitchTimerRef.current);
      hoverSwitchTimerRef.current = null;
    }
  };

  const scheduleHoverClose = () => {
    if (hoverCloseTimerRef.current !== null) {
      clearTimeout(hoverCloseTimerRef.current);
    }
    hoverCloseTimerRef.current = setTimeout(() => {
      if (!pinnedCategoryRef.current) {
        setOpenCategory(null);
      }
    }, 300);
  };

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (navContainerRef.current && !navContainerRef.current.contains(e.target as Node)) {
        clearHoverTimers();
        setPinnedCategory(null);
        setOpenCategory(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearHoverTimers();
        setPinnedCategory(null);
        setOpenCategory(null);
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      clearHoverTimers();
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const handleSelectItem = (item: NavCompartmentItem) => {
    clearHoverTimers();
    setPinnedCategory(null);
    setOpenCategory(null);
    setMobileMenuOpen(false);
    if (item.tab) {
      setActiveTab(item.tab);
      return;
    }
    if (item.action === 'nuke' && onOpenNukeAll) {
      onOpenNukeAll();
    } else if (item.action === 'vault' && onOpenVault) {
      onOpenVault();
    } else if (item.action === 'poa' && onOpenPowerOfAttorney) {
      onOpenPowerOfAttorney();
    }
  };

  return (
    <div ref={navContainerRef} className="sticky top-0 z-40 w-full">
      {/* Primary Minimalist Glassmorphic Top Bar — Explicit z-30 Top Layer Above Sub-Bar */}
      <header className="relative z-30 w-full">
        {/* Independent backdrop layer prevents Chromium nested backdrop-root clipping on dropdowns */}
        <div aria-hidden="true" className="absolute inset-0 glass-nav pointer-events-none" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single Brand Logo Incorporation */}
          <button
            type="button"
            onClick={() => {
              clearHoverTimers();
              setPinnedCategory(null);
              setOpenCategory(null);
              setActiveTab(hasScanResults ? 'report' : 'home');
            }}
            aria-label="synOUT Home"
            className="inline-flex items-center whitespace-nowrap shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
          >
            {!logoLoadError ? (
              <img
                src="/synout-logo.svg"
                alt="synOUT"
                referrerPolicy="no-referrer"
                onError={() => setLogoLoadError(true)}
                className="h-8 sm:h-9 w-auto object-contain select-none"
              />
            ) : (
              <span className="text-lg font-extrabold tracking-tight text-white">
                syn<span className="text-sky-400">OUT</span>
              </span>
            )}
          </button>

          {/* Zone 2: 5 Compartmentalized Category Triggers (Full-Height Hit Targets) */}
          <nav
            aria-label="Primary Categories"
            className="hidden lg:flex items-stretch h-full gap-6 text-xs font-medium text-slate-300"
          >
            {compartments.map((cat) => {
              const isCurrentCat = cat.id === activeCategoryId;
              const isOpen = openCategory === cat.id;
              const isPinned = pinnedCategory === cat.id;

              return (
                <div
                  key={cat.id}
                  className="relative h-full flex items-center"
                  onMouseEnter={() => {
                    if (hoverCloseTimerRef.current !== null) {
                      clearTimeout(hoverCloseTimerRef.current);
                      hoverCloseTimerRef.current = null;
                    }
                    if (pinnedCategoryRef.current) {
                      return;
                    }
                    if (openCategory === null || openCategory === cat.id) {
                      if (hoverSwitchTimerRef.current !== null) {
                        clearTimeout(hoverSwitchTimerRef.current);
                        hoverSwitchTimerRef.current = null;
                      }
                      setOpenCategory(cat.id);
                    } else {
                      // 130ms diagonal-trajectory guard when another category menu is already open
                      if (hoverSwitchTimerRef.current !== null) {
                        clearTimeout(hoverSwitchTimerRef.current);
                      }
                      hoverSwitchTimerRef.current = setTimeout(() => {
                        if (!pinnedCategoryRef.current) {
                          setOpenCategory(cat.id);
                        }
                      }, 130);
                    }
                  }}
                  onMouseLeave={() => {
                    if (hoverSwitchTimerRef.current !== null) {
                      clearTimeout(hoverSwitchTimerRef.current);
                      hoverSwitchTimerRef.current = null;
                    }
                    if (!isPinned) {
                      scheduleHoverClose();
                    }
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      clearHoverTimers();
                      if (isOpen && isPinned) {
                        setPinnedCategory(null);
                        setOpenCategory(null);
                      } else {
                        setPinnedCategory(cat.id);
                        setOpenCategory(cat.id);
                      }
                    }}
                    aria-expanded={isOpen}
                    aria-haspopup="menu"
                    className={`h-full px-1.5 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isCurrentCat || isOpen
                        ? 'text-white underline decoration-emerald-400 decoration-2 underline-offset-8'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <span>{cat.label}</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                        isOpen ? 'rotate-180 text-emerald-400' : ''
                      }`}
                    />
                  </button>

                  {/* Frosted Glass Category Compartment Popover — Top Layer (z-50 inside header z-30) */}
                  {isOpen && (
                    <div
                      role="menu"
                      onMouseEnter={clearHoverTimers}
                      onMouseLeave={() => {
                        if (!isPinned) {
                          scheduleHoverClose();
                        }
                      }}
                      className="absolute left-1/2 -translate-x-1/2 top-full pt-2 w-80 z-50 before:content-[''] before:absolute before:-top-2 before:inset-x-0 before:h-4"
                    >
                      <div className="glass-popover rounded-2xl p-2 space-y-1">
                        <div className="px-3 py-2 border-b border-white/[0.08] flex items-center justify-between gap-2">
                          <div>
                            <div className="text-xs font-semibold text-white">{cat.label}</div>
                            <div className="text-[11px] text-slate-400">{cat.summary}</div>
                          </div>
                          {isPinned && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPinnedCategory(null);
                                setOpenCategory(null);
                              }}
                              aria-label="Close category menu"
                              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {cat.items.map((item) => {
                          const Icon = item.icon;
                          const isItemActive = Boolean(item.tab && item.tab === activeTab);
                          const isNuke = item.action === 'nuke';

                          return (
                            <button
                              key={item.id}
                              type="button"
                              role="menuitem"
                              onClick={() => handleSelectItem(item)}
                              className={`w-full text-left px-3 py-2.5 rounded-xl flex items-start gap-3 transition-colors cursor-pointer ${
                                isItemActive
                                  ? 'bg-emerald-500/15 text-white'
                                  : isNuke
                                  ? 'hover:bg-red-500/15 text-rose-300'
                                  : 'hover:bg-white/[0.07] text-slate-200'
                              }`}
                            >
                              <Icon
                                className={`w-4 h-4 mt-0.5 shrink-0 ${
                                  isNuke
                                    ? 'text-rose-400'
                                    : isItemActive
                                    ? 'text-emerald-400'
                                    : 'text-slate-400'
                                }`}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold truncate">
                                    {item.label}
                                  </span>
                                  {typeof item.badgeCount === 'number' && (
                                    <span className="text-[11px] font-mono tabular-nums text-emerald-300 shrink-0">
                                      {item.badgeCount}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                  {item.description}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action (+ Mobile Menu Button on <lg) */}
          <div className="flex items-center gap-2.5 shrink-0">
            {hasScanResults && onOpenNukeAll ? (
              <button
                type="button"
                onClick={() => {
                  clearHoverTimers();
                  setPinnedCategory(null);
                  setOpenCategory(null);
                  onOpenNukeAll();
                }}
                title="Mass-suppress personal records across data brokers, opt-out forms, and clearinghouses"
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 border border-red-400/30 shadow-lg shadow-red-600/20 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Flame className="w-3.5 h-3.5" />
                <span>NUKE ALL</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  clearHoverTimers();
                  setPinnedCategory(null);
                  setOpenCategory(null);
                  setActiveTab('scanner');
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Start Audit</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle categorized navigation menu"
              className="lg:hidden p-2 rounded-xl glass-subtle text-slate-300 hover:text-white cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Contextual Glassmorphic Sub-Bar — Explicit z-10 Lower Layer Behind Primary Dropdowns */}
      <div className="relative z-10 hidden lg:block w-full glass-subnav">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-10 flex items-center justify-between gap-4 text-xs">
          {/* Active Compartment Sibling Tabs */}
          <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto">
            <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap shrink-0">
              {activeCompartment.label}
            </span>
            <span aria-hidden="true" className="text-slate-600">
              /
            </span>
            <div className="flex items-center gap-1">
              {activeCompartment.items.map((item) => {
                const isActive = Boolean(item.tab && item.tab === activeTab);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectItem(item)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                      isActive
                        ? 'bg-white/[0.09] text-white'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span>{item.shortLabel}</span>
                    {typeof item.badgeCount === 'number' && (
                      <span className="ml-1.5 font-mono text-emerald-400">
                        ({item.badgeCount})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Minimalist Workspace Utility Shortcuts */}
          <div className="flex items-center gap-3 text-[11px] text-slate-400 shrink-0">
            <button
              type="button"
              onClick={() => {
                setPinnedCategory(null);
                setOpenCategory(null);
                setActiveTab('inbox');
              }}
              className={`inline-flex items-center gap-1.5 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'inbox' ? 'text-emerald-300 font-semibold' : ''
              }`}
            >
              <Inbox className="w-3.5 h-3.5 text-emerald-400" />
              <span>Inbox Harvester</span>
            </button>

            <span aria-hidden="true" className="text-slate-700">
              ·
            </span>

            <button
              type="button"
              onClick={() => {
                setPinnedCategory(null);
                setOpenCategory(null);
                setActiveTab('gmail');
              }}
              className="inline-flex items-center gap-1.5 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer max-w-[210px]"
            >
              {isAnyEmailConnected ? (
                <CheckCircle2
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isDirectSendConnected ? 'text-emerald-400' : 'text-sky-400'
                  }`}
                />
              ) : (
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
              <span className="truncate font-mono">
                {isAnyEmailConnected && activeConnectedEmail
                  ? activeConnectedEmail
                  : 'Connect Email'}
              </span>
            </button>

            {onOpenVault && (
              <>
                <span aria-hidden="true" className="text-slate-700">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPinnedCategory(null);
                    setOpenCategory(null);
                    onOpenVault();
                  }}
                  className="inline-flex items-center gap-1 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5 text-slate-400" />
                  <span>Vault</span>
                </button>
              </>
            )}

            {onOpenPowerOfAttorney && (
              <>
                <span aria-hidden="true" className="text-slate-700">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPinnedCategory(null);
                    setOpenCategory(null);
                    onOpenPowerOfAttorney();
                  }}
                  className={`inline-flex items-center gap-1 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isPoaSigned ? 'text-emerald-300' : ''
                  }`}
                >
                  <FileCheck className="w-3.5 h-3.5 text-slate-400" />
                  <span>{isPoaSigned ? 'POA Signed' : 'Sign POA'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Compartmentalized Mobile Glass Drawer — Explicit z-20 Layer */}
      {mobileMenuOpen && (
        <div className="relative z-20 lg:hidden glass-popover border-x-0 border-t-0 max-h-[80vh] overflow-y-auto px-4 py-5 space-y-5">
          {compartments.map((cat) => (
            <div key={cat.id} className="space-y-1.5">
              <div className="px-2 text-[11px] font-semibold text-emerald-400 tracking-wide">
                {cat.label} — <span className="text-slate-400 font-normal">{cat.summary}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {cat.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = Boolean(item.tab && item.tab === activeTab);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectItem(item)}
                      className={`p-2.5 rounded-xl text-left flex items-center gap-2.5 text-xs transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-emerald-500/20 text-white border border-emerald-400/30'
                          : 'glass-subtle text-slate-200 hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="font-medium truncate">{item.label}</span>
                      {typeof item.badgeCount === 'number' && (
                        <span className="ml-auto font-mono text-[11px] text-emerald-300 tabular-nums">
                          {item.badgeCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
