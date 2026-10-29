import React, { useMemo, useRef, useState } from 'react';
import {
  DataBroker,
  ScanHistorySnapshot,
  ScanResult,
  ScanStats,
  UserProfile,
} from '../types';
import { getBrokerRecordSearchUrl } from '../utils/scanEngine';
import {
  findBrokerById,
  hasVerifiedEmailReceipt,
  useEmailConnection,
} from '../services/emailConnectionStore';
import {
  generateMarkdownReport,
  generatePlainTextReport,
  generateAsciiDocReport,
  generateMeReport,
  downloadFile,
  triggerPrintablePdf,
} from '../utils/exportEngines';
import {
  exportExposureReportCsv,
  exportFullScanResultsCsv,
  exportFullScanResultsJson,
} from '../utils/csvExport';
import {
  buildPdfSummaryDocumentData,
  downloadExposurePdfSummary,
} from '../utils/pdfSummaryExporter';
import {
  resolveBrokerContactProfile,
  useBrokerContactOverrides,
} from '../utils/brokerContactResolver';
import { hasWebFormSubmission } from '../utils/optOutFormEngine';
import { shouldRenderOptOutTimeline } from '../utils/optOutTimelineEngine';
import { ExposureTrendChart } from './ExposureTrendChart';
import { ProfileQuickFixPanel } from './ProfileQuickFixPanel';
import { OptOutMiniTimeline } from './OptOutMiniTimeline';
import { PrivacyTacticsModal } from './PrivacyTacticsModal';
import {
  BrokerLiveIntelResponse,
  lookupBrokerLiveIntelClient,
} from '../services/privacyAdvisorClient';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Search,
  Download,
  ExternalLink,
  FileText,
  Eye,
  LayoutGrid,
  List,
  Clock,
  Printer,
  RotateCcw,
  Globe,
  Mail,
  FileSpreadsheet,
  AlertTriangle,
  Archive,
  Flame,
  FileCode2,
  Bot,
  Activity,
  FileJson,
  MessageSquare,
  Wrench,
} from 'lucide-react';

interface ExposureReportProps {
  results: ScanResult[];
  stats: ScanStats;
  profile: UserProfile;
  scanSnapshots?: ScanHistorySnapshot[];
  relistedBrokerIds?: string[];
  onCaptureSnapshot?: () => void;
  onUpdateProfile?: (updatedProfile: UserProfile, refreshScan?: boolean) => void;
  onOpenAdvisor?: (initialPrompt?: string) => void;
  onOpenListingModal: (broker: DataBroker, result: ScanResult) => void;
  onOpenLegalNotice: (broker: DataBroker, result: ScanResult) => void;
  onAutomatedOptOut: (brokerId: string) => void;
  onBatchOptOut: () => void;
  onBatchOptOutSelected?: (brokerIds: string[]) => void;
  onReScan: () => void;
  onToggleStatus: (brokerId: string) => void;
  onOpenResurfaceModal: () => void;
  onOpenVectorModal: () => void;
  onOpenAuditLogModal: () => void;
  onOpenDiyAssistantModal: (broker: DataBroker, result: ScanResult) => void;
  onOpenGmailDispatch?: (brokerId?: string) => void;
  onOpenDeindexCenter?: () => void;
  onOpenVaultModal?: () => void;
  onOpenFirewallHub?: () => void;
  onOpenReplyTriage?: () => void;
  onOpenNukeAll?: () => void;
  onOpenWebFormWorkbench?: (broker?: DataBroker) => void;
  onRunLiveProbe?: (broker: DataBroker) => Promise<void>;
  onOpenAutomatedNavigator?: (broker: DataBroker, result: ScanResult) => void;
  onOpenInboxHarvester?: () => void;
  onOpenStateRegistries?: () => void;
}

export const ExposureReport: React.FC<ExposureReportProps> = ({
  results,
  stats,
  profile,
  scanSnapshots = [],
  relistedBrokerIds = [],
  onCaptureSnapshot,
  onUpdateProfile,
  onOpenAdvisor,
  onOpenListingModal,
  onOpenLegalNotice,
  onAutomatedOptOut,
  onBatchOptOut,
  onBatchOptOutSelected,
  onReScan,
  onOpenResurfaceModal,
  onOpenVectorModal,
  onOpenAuditLogModal,
  onOpenDiyAssistantModal,
  onOpenDeindexCenter,
  onOpenVaultModal,
  onOpenFirewallHub,
  onOpenReplyTriage,
  onOpenNukeAll,
  onOpenWebFormWorkbench,
  onRunLiveProbe,
  onOpenAutomatedNavigator,
  onOpenInboxHarvester,
  onOpenStateRegistries,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedRisk, setSelectedRisk] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'risk' | 'name' | 'records'>('risk');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [selectedBrokerIds, setSelectedBrokerIds] = useState<string[]>([]);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [isGeneratingPdfSummary, setIsGeneratingPdfSummary] = useState(false);
  const [pdfExportFeedback, setPdfExportFeedback] = useState<string | null>(null);
  const [probingIds, setProbingIds] = useState<Record<string, boolean>>({});
  const [intelLoadingIds, setIntelLoadingIds] = useState<Record<string, boolean>>({});
  const [brokerIntelMap, setBrokerIntelMap] = useState<
    Record<string, BrokerLiveIntelResponse>
  >({});
  const [brokerIntelErrors, setBrokerIntelErrors] = useState<Record<string, string>>({});
  const [activeTacticsModal, setActiveTacticsModal] = useState<{
    broker: DataBroker;
    result: ScanResult;
    triggerEl: HTMLElement | null;
  } | null>(null);

  const pdfSummaryRef = useRef<HTMLDivElement>(null);
  const pdfSummaryData = useMemo(
    () => buildPdfSummaryDocumentData(profile, results, stats, scanSnapshots),
    [profile, results, stats, scanSnapshots]
  );

  const { isDirectSendConnected, activeConnectedEmail } = useEmailConnection();
  const contactOverrides = useBrokerContactOverrides();
  const exposedItems = results.filter((r) => r.status === 'exposed');
  const pendingEmailCount = exposedItems.filter((r) => !hasVerifiedEmailReceipt(r)).length;

  const filteredItems = exposedItems
    .filter((item) => {
      const broker = findBrokerById(item.brokerId);
      if (!broker) return false;

      const matchesQuery =
        broker.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        broker.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
        broker.dataExposedList.some((d) => d.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCat = selectedCategory === 'all' || broker.category === selectedCategory;
      const matchesRisk = selectedRisk === 'all' || broker.risk === selectedRisk;

      return matchesQuery && matchesCat && matchesRisk;
    })
    .sort((a, b) => {
      const brokerA = findBrokerById(a.brokerId);
      const brokerB = findBrokerById(b.brokerId);
      if (!brokerA || !brokerB) return 0;

      if (sortBy === 'risk') {
        const riskOrder = { Critical: 3, High: 2, Medium: 1 };
        return riskOrder[brokerB.risk] - riskOrder[brokerA.risk];
      }
      if (sortBy === 'name') {
        return brokerA.name.localeCompare(brokerB.name);
      }
      return (b.mockListingData.recordsCount || 0) - (a.mockListingData.recordsCount || 0);
    });

  const toggleSelectBroker = (brokerId: string) => {
    setSelectedBrokerIds((prev) =>
      prev.includes(brokerId) ? prev.filter((id) => id !== brokerId) : [...prev, brokerId]
    );
  };

  const allFilteredIds = filteredItems.map((i) => i.brokerId);
  const areAllFilteredSelected =
    allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedBrokerIds.includes(id));

  const handleToggleSelectAllFiltered = () => {
    if (areAllFilteredSelected) {
      setSelectedBrokerIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
    } else {
      setSelectedBrokerIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  const handleExportMarkdown = () => {
    const md = generateMarkdownReport(results, stats, profile);
    downloadFile(md, `synOUT-Exposure-Report-${profile.lastName}.md`, 'text/markdown');
    setExportDropdownOpen(false);
  };

  const handleExportPlainText = () => {
    const txt = generatePlainTextReport(results, stats, profile);
    downloadFile(txt, `synOUT-Exposure-Report-${profile.lastName}.txt`, 'text/plain');
    setExportDropdownOpen(false);
  };

  const handleExportAsciiDoc = () => {
    const adoc = generateAsciiDocReport(results, stats, profile);
    downloadFile(adoc, `synOUT-Exposure-Report-${profile.lastName}.adoc`, 'text/asciidoc');
    setExportDropdownOpen(false);
  };

  const handleExportMe = () => {
    const me = generateMeReport(results, stats, profile);
    downloadFile(me, `synOUT-Exposure-Report-${profile.lastName}.me`, 'text/troff');
    setExportDropdownOpen(false);
  };

  const handleExportCsv = () => {
    exportExposureReportCsv(profile, results);
    setExportDropdownOpen(false);
  };

  const handleExportFullScanCsv = () => {
    exportFullScanResultsCsv(profile, results);
    setExportDropdownOpen(false);
  };

  const handleExportFullScanJson = () => {
    exportFullScanResultsJson(profile, results, stats, scanSnapshots);
    setExportDropdownOpen(false);
  };

  const handleExportPdf = () => {
    triggerPrintablePdf(results, stats, profile);
    setExportDropdownOpen(false);
  };

  const handleDownloadVisualPdfSummary = async () => {
    if (!pdfSummaryRef.current || isGeneratingPdfSummary) return;
    setIsGeneratingPdfSummary(true);
    setPdfExportFeedback(null);
    setExportDropdownOpen(false);
    try {
      const savedFilename = await downloadExposurePdfSummary({
        element: pdfSummaryRef.current,
        profile,
        stats,
      });
      setPdfExportFeedback(`Downloaded ${savedFilename}`);
    } catch (err) {
      setPdfExportFeedback(
        err instanceof Error ? err.message : 'Unable to generate PDF summary.'
      );
    } finally {
      setIsGeneratingPdfSummary(false);
    }
  };

  const handleLookupBrokerWebIntel = async (broker: DataBroker, optOutUrl: string) => {
    setIntelLoadingIds((prev) => ({ ...prev, [broker.id]: true }));
    setBrokerIntelErrors((prev) => {
      const next = { ...prev };
      delete next[broker.id];
      return next;
    });
    try {
      const intel = await lookupBrokerLiveIntelClient({
        brokerName: broker.name,
        brokerDomain: broker.domain,
        optOutUrl,
        jurisdictionState: profile.currentState,
      });
      setBrokerIntelMap((prev) => ({ ...prev, [broker.id]: intel }));
    } catch (err) {
      setBrokerIntelErrors((prev) => ({
        ...prev,
        [broker.id]:
          err instanceof Error
            ? err.message
            : 'Unable to retrieve live web intelligence.',
      }));
    } finally {
      setIntelLoadingIds((prev) => ({ ...prev, [broker.id]: false }));
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-6">
      {/* Regression Banner when previously actioned brokers re-appear */}
      {relistedBrokerIds.length > 0 && (
        <div className="p-4 glass-panel border-rose-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-rose-300">
                Re-Exposure Regression Detected ({relistedBrokerIds.length} Broker{relistedBrokerIds.length === 1 ? '' : 's'}):{' '}
              </span>
              <span className="text-slate-300">
                {relistedBrokerIds
                  .map((id) => findBrokerById(id)?.name || id)
                  .join(', ')}{' '}
                re-indexed personal details after a prior suppression action.
              </span>
            </div>
          </div>
          {onBatchOptOutSelected && (
            <button
              type="button"
              onClick={() => onBatchOptOutSelected(relistedBrokerIds)}
              className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
            >
              Re-Suppress {relistedBrokerIds.length} Regression{relistedBrokerIds.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      )}

      {/* Top Dossier Summary Header */}
      <div className="p-6 sm:p-8 glass-panel rounded-2xl space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="font-medium text-rose-400 inline-flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" /> Exposure Dossier
              </span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span>
                {profile.firstName} {profile.lastName}
              </span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span>
                {profile.currentCity}, {profile.currentState}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight [text-wrap:balance]">
              Your Personal Exposure Report &amp; Removal Plan
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
              We found <strong className="text-white tabular-nums">{stats.exposedBrokers} data brokers</strong> likely listing your info. Remove your records below using <strong>Automatic Web Forms</strong> (synOUT fills fields &amp; checks boxes for you) and <strong>Legal Removal Emails</strong>.
            </p>
          </div>

          {/* Action Center: PDF Summary, Full Scan JSON/CSV Export & Batch Removal */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isGeneratingPdfSummary}
              onClick={() => void handleDownloadVisualPdfSummary()}
              title="Generate and download a visually formatted, printer-friendly PDF summary of your current exposure status"
              className="px-3.5 py-2.5 rounded-xl glass-card border-rose-400/25 text-white hover:border-rose-400/50 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <Printer className="w-4 h-4 text-rose-400" />
              <span>
                {isGeneratingPdfSummary ? 'Generating PDF...' : 'Download PDF Summary'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleExportFullScanJson}
              title={`Export all ${results.length} scanned broker records (exposed & clean) plus historical trend snapshots as JSON`}
              className="px-3.5 py-2.5 rounded-xl glass-card text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
            >
              <FileJson className="w-4 h-4 text-sky-400" />
              <span>Export JSON ({results.length})</span>
            </button>

            <button
              type="button"
              onClick={handleExportFullScanCsv}
              title={`Export all ${results.length} scanned broker records (exposed & clean) as CSV for external documentation`}
              className="px-3.5 py-2.5 rounded-xl glass-card text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Export CSV ({results.length})</span>
            </button>

            <div className="relative">
              <button
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                className="px-3.5 py-2.5 rounded-xl glass-card text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>More Formats</span>
              </button>

              {exportDropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 glass-popover rounded-2xl p-2 z-30 space-y-1">
                  <button
                    type="button"
                    disabled={isGeneratingPdfSummary}
                    onClick={() => void handleDownloadVisualPdfSummary()}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-rose-300 hover:text-white hover:bg-white/[0.06] flex items-center justify-between cursor-pointer whitespace-nowrap"
                  >
                    <span>Download PDF Summary (.pdf)</span>
                    <Printer className="w-3.5 h-3.5 text-rose-400" />
                  </button>
                  <button
                    onClick={handleExportFullScanJson}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-sky-300 hover:text-white hover:bg-white/[0.06] flex items-center justify-between cursor-pointer whitespace-nowrap"
                  >
                    <span>Full Scan Results (.json · All {results.length})</span>
                    <FileJson className="w-3.5 h-3.5 text-sky-400" />
                  </button>
                  <button
                    onClick={handleExportFullScanCsv}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-emerald-300 hover:text-white hover:bg-white/[0.06] flex items-center justify-between cursor-pointer border-b border-white/[0.07] pb-2 whitespace-nowrap"
                  >
                    <span>Full Scan Results (.csv · All {results.length})</span>
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  </button>
                  <button
                    onClick={handleExportPdf}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-slate-200 hover:text-white hover:bg-white/[0.06] flex items-center justify-between cursor-pointer whitespace-nowrap"
                  >
                    <span>Browser Print View (.html)</span>
                    <FileText className="w-3.5 h-3.5 text-rose-400" />
                  </button>
                  <button
                    onClick={handleExportCsv}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-slate-200 hover:text-white hover:bg-white/[0.06] flex items-center justify-between cursor-pointer whitespace-nowrap"
                  >
                    <span>Exposed Brokers Only (.csv)</span>
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  </button>
                  <button
                    onClick={handleExportMarkdown}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-slate-200 hover:text-white hover:bg-white/[0.06] flex items-center justify-between cursor-pointer whitespace-nowrap"
                  >
                    <span>Markdown Dossier (.md)</span>
                    <FileText className="w-3.5 h-3.5 text-sky-400" />
                  </button>
                  <button
                    onClick={handleExportPlainText}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-slate-200 hover:text-white hover:bg-white/[0.06] flex items-center justify-between cursor-pointer whitespace-nowrap"
                  >
                    <span>Plain Text Report (.txt)</span>
                    <FileText className="w-3.5 h-3.5 text-emerald-400" />
                  </button>
                  <button
                    onClick={handleExportMe}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-slate-200 hover:text-white hover:bg-white/[0.06] flex items-center justify-between cursor-pointer whitespace-nowrap"
                  >
                    <span>UNIX roff Document (.me)</span>
                    <FileText className="w-3.5 h-3.5 text-teal-400" />
                  </button>
                  <button
                    onClick={handleExportAsciiDoc}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-slate-200 hover:text-white hover:bg-white/[0.06] flex items-center justify-between cursor-pointer whitespace-nowrap"
                  >
                    <span>AsciiDoc Document (.adoc)</span>
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                  </button>
                  {onOpenVaultModal && (
                    <button
                      onClick={() => {
                        setExportDropdownOpen(false);
                        onOpenVaultModal();
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-emerald-300 hover:text-white hover:bg-white/[0.06] flex items-center justify-between cursor-pointer border-t border-white/[0.07] pt-2 whitespace-nowrap"
                    >
                      <span>Encrypted Vault Backup (.json)</span>
                      <Archive className="w-3.5 h-3.5 text-emerald-400" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {selectedBrokerIds.length > 0 && onBatchOptOutSelected && (
              <button
                type="button"
                onClick={() => onBatchOptOutSelected(selectedBrokerIds)}
                className="px-4 py-2.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
              >
                <Mail className="w-4 h-4" />
                <span>Opt Out Selected ({selectedBrokerIds.length})</span>
              </button>
            )}

            <button
              onClick={onBatchOptOut}
              className="px-4 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
            >
              <Mail className="w-4 h-4" />
              <span>
                {pendingEmailCount > 0
                  ? `Opt Out of All (${pendingEmailCount} Brokers)${isDirectSendConnected && activeConnectedEmail ? ` via ${activeConnectedEmail}` : ''}`
                  : `Re-Send Opt-Out Emails (${stats.exposedBrokers})`}
              </span>
            </button>

            {onOpenNukeAll && (
              <button
                type="button"
                onClick={onOpenNukeAll}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white border border-red-400/25 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Flame className="w-4 h-4" />
                <span>NUKE ALL</span>
              </button>
            )}
          </div>
        </div>

        {/* Hairline Metric Strip (Zero Nested Card-in-Card Boxes) */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-white/[0.07] border-y border-white/[0.07] py-4 tabular-nums">
          <div className="py-2 md:py-0 md:pr-6">
            <span className="text-xs text-slate-400 block">Exposed Brokers</span>
            <span className="text-2xl font-bold text-rose-400 font-mono mt-0.5 block">{stats.exposedBrokers}</span>
          </div>

          <div className="py-2 md:py-0 md:px-6">
            <span className="text-xs text-slate-400 block">High-Priority Sites</span>
            <span className="text-2xl font-bold text-rose-500 font-mono mt-0.5 block">{stats.criticalBrokers}</span>
          </div>

          <div className="py-2 md:py-0 md:px-6">
            <span className="text-xs text-slate-400 block">Estimated Records</span>
            <span className="text-2xl font-bold text-white font-mono mt-0.5 block">{stats.totalRecordsExposed}</span>
          </div>

          <div className="py-2 md:py-0 md:pl-6">
            <span className="text-xs text-slate-400 block">Removals Started</span>
            <span className="text-2xl font-bold text-emerald-400 font-mono mt-0.5 block">{stats.inProgressRemovals}</span>
          </div>
        </div>

        {/* Plain-English Dual-Channel Removal Guide: Web Forms vs. Email */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 text-xs">
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col justify-between gap-3">
            <div className="space-y-1">
              <div className="font-bold text-white flex items-center gap-2">
                <Bot className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Method 1: Remove via Online Forms (Done For You)</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                Some sites require filling out an online opt-out form. synOUT opens the form, fills
                your details, <strong>checks required consent &amp; removal checkboxes</strong> (skipping
                marketing spam), and submits on your behalf.
              </p>
            </div>
            {onOpenWebFormWorkbench && (
              <div>
                <button
                  type="button"
                  onClick={() => onOpenWebFormWorkbench()}
                  className="px-4 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <FileCode2 className="w-3.5 h-3.5" />
                  <span>Auto-Fill &amp; Submit Web Forms</span>
                </button>
              </div>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col justify-between gap-3">
            <div className="space-y-1">
              <div className="font-bold text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Method 2: Remove via Legal Email (Sent For You)</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                Sends official privacy-law deletion demands directly from your email (with 1-Click
                Webmail — no password needed — or automatic background sending) so brokers must
                legally erase your data.
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={onBatchOptOut}
                className="px-4 py-2 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap tabular-nums"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>
                  {pendingEmailCount > 0
                    ? `Send Legal Emails (${pendingEmailCount} Brokers)`
                    : `Review Sent Emails (${stats.exposedBrokers})`}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Secondary Analysis & Verification Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenVectorModal}
              className="px-3 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.06] text-slate-300 hover:text-white font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Risk Vectors
            </button>
            <button
              type="button"
              onClick={onOpenAuditLogModal}
              className="px-3 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.06] text-slate-300 hover:text-white font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Audit Proof Log
            </button>
            <button
              type="button"
              onClick={onOpenResurfaceModal}
              className="px-3 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.06] text-slate-300 hover:text-white font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Resurface Sweep
            </button>
            {onOpenWebFormWorkbench && (
              <button
                type="button"
                onClick={() => onOpenWebFormWorkbench()}
                className="px-3 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.06] text-emerald-300 hover:text-emerald-200 font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <FileCode2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Web-Form Runner</span>
              </button>
            )}
            {onOpenInboxHarvester && (
              <button
                type="button"
                onClick={onOpenInboxHarvester}
                className="px-3 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.06] text-sky-300 hover:text-sky-200 font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Inbox Harvester
              </button>
            )}
            {onOpenStateRegistries && (
              <button
                type="button"
                onClick={onOpenStateRegistries}
                className="px-3 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.06] text-slate-300 hover:text-white font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                State Registries
              </button>
            )}
            {onOpenDeindexCenter && (
              <button
                type="button"
                onClick={onOpenDeindexCenter}
                className="px-3 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.06] text-slate-300 hover:text-white font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Search De-Index
              </button>
            )}
            {onOpenFirewallHub && (
              <button
                type="button"
                onClick={onOpenFirewallHub}
                className="px-3 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.06] text-slate-300 hover:text-white font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Public Records
              </button>
            )}
            {onOpenReplyTriage && (
              <button
                type="button"
                onClick={onOpenReplyTriage}
                className="px-3 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.06] text-amber-300 hover:text-amber-200 font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Reply Triage
              </button>
            )}
            {onOpenAdvisor && (
              <button
                type="button"
                onClick={() => onOpenAdvisor()}
                className="px-3 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.06] text-emerald-300 hover:text-emerald-200 font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                <span>Privacy Advisor</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                document
                  .getElementById('synout-quick-fix-panel')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="px-3 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.06] text-emerald-300 hover:text-emerald-200 font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Wrench className="w-3.5 h-3.5 text-emerald-400" />
              <span>Quick Fix</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onReScan}
            className="px-3 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.06] text-slate-300 hover:text-emerald-300 font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Re-Run Audit</span>
          </button>
        </div>

        {pdfExportFeedback && (
          <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-3 text-xs text-slate-300">
            <span>{pdfExportFeedback}</span>
            <button
              type="button"
              onClick={() => setPdfExportFeedback(null)}
              className="text-slate-400 hover:text-white cursor-pointer whitespace-nowrap shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* D3 Historical Exposure Score Trend Visualization */}
      <ExposureTrendChart
        snapshots={scanSnapshots}
        results={results}
        stats={stats}
        onCaptureSnapshot={onCaptureSnapshot}
      />

      {/* Quick Fix Profile Discrepancy & Match Accuracy Helper */}
      <ProfileQuickFixPanel
        profile={profile}
        results={results}
        connectedEmail={activeConnectedEmail}
        onUpdateProfile={(updated, refresh = true) => {
          onUpdateProfile?.(updated, refresh);
        }}
      />

      {/* Filter, Multi-Select & Sort Controls */}
      <div className="p-4 glass-panel rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter by broker name, domain, or leaked data..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full glass-input rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500"
            />
          </div>

          {filteredItems.length > 0 && (
            <button
              type="button"
              onClick={handleToggleSelectAllFiltered}
              className="px-3 py-2 rounded-xl glass-subtle hover:bg-white/[0.06] text-slate-300 font-medium cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
            >
              {areAllFilteredSelected
                ? 'Clear Selection'
                : `Select All (${filteredItems.length})`}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="glass-input rounded-xl px-3 py-2 text-slate-300 cursor-pointer"
          >
            <option value="all" className="bg-slate-950">All Categories</option>
            <option value="People Search" className="bg-slate-950">People Search</option>
            <option value="Financial & Credit Marketing" className="bg-slate-950">Financial &amp; Credit</option>
            <option value="Real Estate & Property" className="bg-slate-950">Property &amp; Deeds</option>
            <option value="Arrest & Court Records" className="bg-slate-950">Court Records</option>
            <option value="Vehicle & Asset Registry" className="bg-slate-950">Vehicle &amp; Assets</option>
            <option value="B2B & Professional Intelligence" className="bg-slate-950">B2B &amp; Executive</option>
          </select>

          <select
            value={selectedRisk}
            onChange={(e) => setSelectedRisk(e.target.value)}
            className="glass-input rounded-xl px-3 py-2 text-slate-300 cursor-pointer"
          >
            <option value="all" className="bg-slate-950">All Risks</option>
            <option value="Critical" className="bg-slate-950">Critical</option>
            <option value="High" className="bg-slate-950">High</option>
            <option value="Medium" className="bg-slate-950">Medium</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'risk' | 'name' | 'records')}
            className="glass-input rounded-xl px-3 py-2 text-slate-300 cursor-pointer"
            aria-label="Sort exposed brokers"
          >
            <option value="risk" className="bg-slate-950">Sort: Highest Risk</option>
            <option value="records" className="bg-slate-950">Sort: Most Records</option>
            <option value="name" className="bg-slate-950">Sort: Alphabetical</option>
          </select>

          <div className="flex items-center p-1 glass-subtle rounded-xl">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-white/[0.1] text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-white/[0.1] text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredItems.map((result) => {
            const broker = findBrokerById(result.brokerId);
            if (!broker) return null;
            const contact = resolveBrokerContactProfile(broker, contactOverrides);
            const searchUrl = getBrokerRecordSearchUrl(broker, profile);
            const isDispatched = hasVerifiedEmailReceipt(result);
            const isFormSubmitted = hasWebFormSubmission(result);
            const isRemoved = result.removalStatus === 'removed';
            const isSelected = selectedBrokerIds.includes(broker.id);
            const isRelisted =
              relistedBrokerIds.includes(broker.id) || Boolean(result.isRegression);

            return (
              <div
                key={result.id}
                className={`p-5 glass-card rounded-2xl space-y-4 flex flex-col justify-between ${
                  isSelected
                    ? 'border-emerald-400/50 bg-emerald-500/[0.04]'
                    : isRelisted
                    ? 'border-rose-500/40'
                    : ''
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectBroker(broker.id)}
                        aria-label={`Select ${broker.name} for batch opt-out`}
                        className="mt-1 rounded border-slate-700 bg-slate-950 text-emerald-500 cursor-pointer shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                          <span>{broker.category}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              broker.risk === 'Critical'
                                ? 'text-rose-400 font-medium'
                                : broker.risk === 'High'
                                ? 'text-amber-300 font-medium'
                                : 'text-slate-300'
                            }
                          >
                            {broker.risk} Risk
                          </span>
                          {isRelisted && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-rose-400 font-semibold">Re-Listed</span>
                            </>
                          )}
                        </div>
                        <h3 className="text-base font-semibold text-white mt-0.5 truncate">
                          {broker.name}
                        </h3>
                        <p className="text-xs text-slate-500 font-mono truncate">{broker.domain}</p>
                      </div>
                    </div>
                  </div>

                  {/* Leaked Attributes as Clean Unboxed Metadata */}
                  <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                    <span className="text-slate-500">Exposes: </span>
                    {broker.dataExposedList.slice(0, 4).join(' · ')}
                  </p>

                  {/* Direct Link to Regular Web Finding, Live Probe & Opt-Out */}
                  <div className="pt-3 border-t border-white/[0.06] space-y-2 text-xs">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>
                        {result.verificationSource === 'live_listing_match_found' ? (
                          <span className="text-rose-400 font-semibold">Confirmed Live Listing</span>
                        ) : result.verificationSource === 'live_portal_probe_reachable' ? (
                          <span className="text-sky-300">Form Verified Online</span>
                        ) : result.verificationSource === 'live_probe_blocked_anti_bot' ? (
                          <span className="text-amber-300">CAPTCHA Protected · Auto-Fill Ready</span>
                        ) : (
                          <span className="text-slate-400">
                            {broker.removalMethod === 'Online Form'
                              ? 'Uses Web Form + Email'
                              : 'Accepts Legal Email + Form'}
                          </span>
                        )}
                      </span>
                      {onRunLiveProbe && (
                        <button
                          type="button"
                          disabled={Boolean(probingIds[broker.id])}
                          onClick={async () => {
                            setProbingIds((p) => ({ ...p, [broker.id]: true }));
                            try {
                              await onRunLiveProbe(broker);
                            } finally {
                              setProbingIds((p) => ({ ...p, [broker.id]: false }));
                            }
                          }}
                          className="text-[11px] text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          <Activity className="w-3 h-3" />
                          <span>{probingIds[broker.id] ? 'Checking...' : 'Check Site'}</span>
                        </button>
                      )}
                    </div>

                    {result.liveProbeSummary && (
                      <p className="text-[11px] text-slate-400 leading-snug">
                        {result.liveProbeSummary}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-3 pt-1 text-[11px]">
                      <a
                        href={searchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 truncate"
                      >
                        <Globe className="w-3.5 h-3.5 shrink-0" />
                        <span>View Listing</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>

                      <button
                        type="button"
                        disabled={Boolean(intelLoadingIds[broker.id])}
                        onClick={() => void handleLookupBrokerWebIntel(broker, contact.optOutUrl)}
                        className="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        title="Verify current opt-out policy & regulator updates via live Google Search grounding"
                      >
                        <Search className="w-3 h-3 shrink-0" />
                        <span>
                          {intelLoadingIds[broker.id] ? 'Searching...' : 'Live Web Intel'}
                        </span>
                      </button>

                      <a
                        href={contact.optOutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-300 hover:text-white inline-flex items-center gap-1 truncate"
                      >
                        <span className="truncate">Opt-Out</span>
                        <span className="text-slate-500 font-mono tabular-nums">({broker.removalTime})</span>
                      </a>
                    </div>

                    {brokerIntelErrors[broker.id] && (
                      <p className="text-[11px] text-rose-300 pt-1">
                        {brokerIntelErrors[broker.id]}
                      </p>
                    )}

                    {brokerIntelMap[broker.id] && (
                      <div className="pt-2 border-t border-white/[0.06] space-y-1.5 text-[11px]">
                        <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">
                          {brokerIntelMap[broker.id].summaryText}
                        </p>
                        {brokerIntelMap[broker.id].citations.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {brokerIntelMap[broker.id].citations.slice(0, 4).map((cite, cIdx) => (
                              <a
                                key={`${cite.uri}-${cIdx}`}
                                href={cite.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sky-300 hover:text-sky-200 underline underline-offset-2 inline-flex items-center gap-1 max-w-[200px]"
                              >
                                <span className="truncate">{cite.title}</span>
                                <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 45-Day Expected Removal Mini-Timeline for Submitted / Actioned Requests */}
                  {shouldRenderOptOutTimeline(result) && (
                    <OptOutMiniTimeline
                      brokerName={broker.name}
                      result={result}
                      onFollowUp={() => onAutomatedOptOut(broker.id)}
                    />
                  )}
                </div>

                {/* Clear Dual-Channel Removal Buttons (Web Form + Email) */}
                <div className="pt-3 border-t border-white/[0.06] space-y-2">
                  <div className="flex items-center gap-1.5">
                    {(onOpenAutomatedNavigator || onOpenWebFormWorkbench) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenAutomatedNavigator) {
                            onOpenAutomatedNavigator(broker, result);
                          } else {
                            onOpenWebFormWorkbench?.(broker);
                          }
                        }}
                        className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${
                          isFormSubmitted
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/25'
                            : 'glass-subtle hover:bg-white/[0.09] text-emerald-300 border border-emerald-500/25'
                        }`}
                        title="Automatically fill out this broker's online form, check required boxes as they pop up, and submit for you"
                      >
                        <Bot className="w-3.5 h-3.5 shrink-0" />
                        <span>{isFormSubmitted ? 'Form Done' : 'Auto-Fill Form'}</span>
                      </button>
                    )}

                    <button
                      onClick={() => onAutomatedOptOut(broker.id)}
                      className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                        isRemoved
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/25'
                          : isDispatched
                          ? 'bg-sky-500/15 text-sky-300 border border-sky-400/25'
                          : 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                      }`}
                      title={
                        contact.effectivePrimaryEmail
                          ? 'Send an official legal deletion email to this broker on your behalf'
                          : 'Email not offered by this site — synOUT will automatically fill out its online removal form and check boxes for you'
                      }
                    >
                      {isRemoved ? (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5 shrink-0" /> Removed
                        </>
                      ) : isDispatched ? (
                        <>
                          <Clock className="w-3.5 h-3.5 shrink-0" /> Email Sent
                        </>
                      ) : !contact.effectivePrimaryEmail ? (
                        <>
                          <Bot className="w-3.5 h-3.5 shrink-0" /> Auto-Remove
                        </>
                      ) : (
                        <>
                          <Mail className="w-3.5 h-3.5 shrink-0" /> Send Opt-Out
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-slate-400">
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) =>
                          setActiveTacticsModal({
                            broker,
                            result,
                            triggerEl: e.currentTarget,
                          })
                        }
                        className="px-2.5 py-1 rounded-md glass-subtle hover:bg-white/[0.09] text-emerald-300 hover:text-emerald-200 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                        title={`Review actionable Privacy Tactics for ${broker.name}`}
                      >
                        <Shield className="w-3.5 h-3.5 shrink-0" />
                        <span>Privacy Tactics</span>
                      </button>
                      <button
                        onClick={() => onOpenListingModal(broker, result)}
                        className="px-2 py-1 rounded-md hover:bg-white/[0.06] hover:text-white inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                        title="View Full Profile Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Details</span>
                      </button>
                      <button
                        onClick={() => onOpenLegalNotice(broker, result)}
                        className="px-2 py-1 rounded-md hover:bg-white/[0.06] hover:text-white inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                        title="Preview Legal Notice"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Letter</span>
                      </button>
                      <button
                        onClick={() => onOpenDiyAssistantModal(broker, result)}
                        className="px-2 py-1 rounded-md hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                        title="Step-by-Step Guide"
                      >
                        Guide
                      </button>
                      {onOpenAdvisor && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenAdvisor(
                              `Give me the fastest current opt-out strategy and verification rules for ${broker.name} (${broker.domain}).`
                            )
                          }
                          className="px-2 py-1 rounded-md text-emerald-300 hover:text-emerald-200 hover:bg-white/[0.06] transition-colors cursor-pointer whitespace-nowrap"
                          title={`Ask Privacy Advisor about ${broker.name}`}
                        >
                          Ask Advisor
                        </button>
                      )}
                    </div>

                    {onOpenWebFormWorkbench && (
                      <button
                        type="button"
                        onClick={() => onOpenWebFormWorkbench(broker)}
                        className="px-2 py-1 rounded-md text-sky-400 hover:text-sky-300 hover:bg-white/[0.06] inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                        title="Open Full Online Form Studio & Inspector"
                      >
                        <FileCode2 className="w-3.5 h-3.5" />
                        <span>Form Studio</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="p-6 glass-panel rounded-2xl overflow-x-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead>
              <tr className="border-b border-white/[0.08] text-slate-400">
                <th className="pb-3 pr-2 w-8">
                  <input
                    type="checkbox"
                    checked={areAllFilteredSelected}
                    onChange={handleToggleSelectAllFiltered}
                    aria-label="Select all filtered brokers"
                    className="rounded border-slate-700 bg-slate-950 text-emerald-500 cursor-pointer"
                  />
                </th>
                <th className="pb-3 font-medium">Entity Name</th>
                <th className="pb-3 font-medium">Category</th>
                <th className="pb-3 font-medium">Risk</th>
                <th className="pb-3 font-medium">Record Link</th>
                <th className="pb-3 font-medium">Opt-Out Portal</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filteredItems.map((result) => {
                const broker = findBrokerById(result.brokerId);
                if (!broker) return null;
                const contact = resolveBrokerContactProfile(broker, contactOverrides);
                const searchUrl = getBrokerRecordSearchUrl(broker, profile);
                const isSelected = selectedBrokerIds.includes(broker.id);
                const emailSent = hasVerifiedEmailReceipt(result);
                const formSent = hasWebFormSubmission(result);

                return (
                  <tr key={result.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="py-3 pr-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectBroker(broker.id)}
                        aria-label={`Select ${broker.name}`}
                        className="rounded border-slate-700 bg-slate-950 text-emerald-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3">
                      <strong className="text-white font-semibold block">{broker.name}</strong>
                      <span className="text-slate-500 font-mono text-[11px]">{broker.domain}</span>
                    </td>
                    <td className="py-3 text-slate-300">{broker.category}</td>
                    <td className="py-3">
                      <span
                        className={
                          broker.risk === 'Critical'
                            ? 'text-rose-400 font-semibold'
                            : broker.risk === 'High'
                            ? 'text-amber-300 font-medium'
                            : 'text-slate-400'
                        }
                      >
                        {broker.risk}
                      </span>
                    </td>
                    <td className="py-3">
                      <a
                        href={searchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        Inspect <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </td>
                    <td className="py-3">
                      <a
                        href={contact.optOutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        Opt-Out <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </td>
                    <td className="py-3 min-w-[200px]">
                      <div className="space-y-1.5">
                        <span
                          className={`font-medium whitespace-nowrap ${
                            result.removalStatus === 'removed'
                              ? 'text-emerald-400'
                              : emailSent && formSent
                              ? 'text-emerald-300'
                              : emailSent
                              ? 'text-sky-300'
                              : formSent
                              ? 'text-emerald-400'
                              : 'text-amber-300'
                          }`}
                        >
                          {result.removalStatus === 'removed'
                            ? 'Removed'
                            : emailSent && formSent
                            ? 'Form + Email'
                            : emailSent
                            ? 'Email Sent'
                            : formSent
                            ? 'Form Logged'
                            : 'Exposed'}
                        </span>
                        {shouldRenderOptOutTimeline(result) && (
                          <OptOutMiniTimeline
                            brokerName={broker.name}
                            result={result}
                            compact
                            onFollowUp={() => onAutomatedOptOut(broker.id)}
                          />
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(e) =>
                            setActiveTacticsModal({
                              broker,
                              result,
                              triggerEl: e.currentTarget,
                            })
                          }
                          className="px-2.5 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.08] text-emerald-300 font-medium text-xs cursor-pointer whitespace-nowrap"
                          title={`Review Privacy Tactics for ${broker.name}`}
                        >
                          Privacy Tactics
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenListingModal(broker, result)}
                          className="px-2 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.08] text-slate-300 font-medium text-xs cursor-pointer whitespace-nowrap"
                          title="View Exposed Profile Details"
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenLegalNotice(broker, result)}
                          className="px-2 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.08] text-slate-300 font-medium text-xs cursor-pointer whitespace-nowrap"
                          title="Preview Statutory Deletion Notice"
                        >
                          Letter
                        </button>
                        <button
                          onClick={() => onOpenDiyAssistantModal(broker, result)}
                          className="px-2 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.08] text-slate-300 font-medium text-xs cursor-pointer whitespace-nowrap"
                        >
                          DIY
                        </button>
                        {onOpenAdvisor && (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenAdvisor(
                                `Give me the fastest current opt-out strategy and verification rules for ${broker.name} (${broker.domain}).`
                              )
                            }
                            className="px-2 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.08] text-emerald-300 font-medium text-xs cursor-pointer whitespace-nowrap"
                          >
                            Advisor
                          </button>
                        )}
                        {(onOpenAutomatedNavigator || onOpenWebFormWorkbench) && (
                          <button
                            type="button"
                            onClick={() => {
                              if (onOpenAutomatedNavigator) {
                                onOpenAutomatedNavigator(broker, result);
                              } else {
                                onOpenWebFormWorkbench?.(broker);
                              }
                            }}
                            className="px-2.5 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.08] text-emerald-300 font-medium text-xs cursor-pointer whitespace-nowrap"
                          >
                            {formSent ? 'Form Done' : 'Auto-Fill Form'}
                          </button>
                        )}
                        <button
                          onClick={() => onAutomatedOptOut(broker.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold text-xs cursor-pointer whitespace-nowrap"
                        >
                          {!contact.effectivePrimaryEmail ? 'Auto-Remove' : 'Send Opt-Out'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Off-Screen Printer-Friendly Summary Sheet Captured via html2canvas + jsPDF */}
      <div
        id="synout-pdf-summary-sheet"
        ref={pdfSummaryRef}
        aria-hidden="true"
        className="pdf-offscreen-stage"
      >
        <div className="pdf-summary-sheet">
          <div className="pdf-summary-header">
            <div>
              <div className="pdf-summary-kicker">
                synOUT · Personal Data Exposure &amp; Suppression Status Summary
              </div>
              <h2 className="pdf-summary-title">{pdfSummaryData.subjectFullName}</h2>
              <div className="pdf-summary-meta">
                <div>
                  Jurisdiction: <strong>{pdfSummaryData.jurisdictionLabel}</strong> · Address:{' '}
                  {pdfSummaryData.addressSummary}
                </div>
                <div>{pdfSummaryData.contactSummary}</div>
                <div>
                  Report Reference: <strong>{pdfSummaryData.referenceId}</strong> · Generated{' '}
                  {pdfSummaryData.generatedDateLabel}
                </div>
              </div>
            </div>

            <div className="pdf-summary-score-box">
              <span className="pdf-summary-score-label">Current Exposure Score</span>
              <span className="pdf-summary-score-value">{pdfSummaryData.exposureScore}/100</span>
              <span className="pdf-summary-score-delta">
                {pdfSummaryData.scoreDelta < 0
                  ? `${pdfSummaryData.scoreDelta} pts vs. baseline (${pdfSummaryData.baselineScore})`
                  : pdfSummaryData.scoreDelta > 0
                  ? `+${pdfSummaryData.scoreDelta} pts vs. baseline (${pdfSummaryData.baselineScore})`
                  : `Baseline calibrated (${pdfSummaryData.totalScanned} scanned)`}
              </span>
            </div>
          </div>

          <div className="pdf-summary-metrics-grid">
            <div className="pdf-summary-metric-cell">
              <span className="pdf-summary-metric-caption">Brokers Scanned</span>
              <span className="pdf-summary-metric-number">{pdfSummaryData.totalScanned}</span>
            </div>
            <div className="pdf-summary-metric-cell">
              <span className="pdf-summary-metric-caption">Exposed Brokers</span>
              <span className="pdf-summary-metric-number pdf-summary-metric-critical">
                {pdfSummaryData.exposedBrokers}
              </span>
            </div>
            <div className="pdf-summary-metric-cell">
              <span className="pdf-summary-metric-caption">Critical / High Risk</span>
              <span className="pdf-summary-metric-number">
                {pdfSummaryData.criticalBrokers + pdfSummaryData.highRiskBrokers}
              </span>
            </div>
            <div className="pdf-summary-metric-cell">
              <span className="pdf-summary-metric-caption">Removals Submitted</span>
              <span className="pdf-summary-metric-number pdf-summary-metric-emerald">
                {pdfSummaryData.inProgressRemovals}
              </span>
            </div>
            <div className="pdf-summary-metric-cell">
              <span className="pdf-summary-metric-caption">Verified Removed</span>
              <span className="pdf-summary-metric-number pdf-summary-metric-emerald">
                {pdfSummaryData.removedBrokers}
              </span>
            </div>
          </div>

          <div className="pdf-summary-two-col">
            <div>
              <h3 className="pdf-summary-section-title">Exposure Breakdown by Registry Category</h3>
              <table className="pdf-summary-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Exposed</th>
                    <th>Clean</th>
                    <th>Actioned</th>
                  </tr>
                </thead>
                <tbody>
                  {pdfSummaryData.categoryBreakdown.map((cat) => (
                    <tr key={cat.category}>
                      <td>{cat.category}</td>
                      <td>{cat.exposedCount}</td>
                      <td>{cat.cleanCount}</td>
                      <td>{cat.inProgressOrRemovedCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="pdf-summary-section-title">Historical Score Trend</h3>
              {pdfSummaryData.historicalPoints.length === 0 ? (
                <div className="pdf-summary-meta">
                  Current scan establishes baseline score ({pdfSummaryData.exposureScore}/100) across{' '}
                  {pdfSummaryData.exposedBrokers} exposed brokers. Capture future audit snapshots to
                  chart longitudinal score reduction.
                </div>
              ) : (
                <table className="pdf-summary-table">
                  <thead>
                    <tr>
                      <th>Audit Date</th>
                      <th>Score</th>
                      <th>Exposed</th>
                      <th>Removed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pdfSummaryData.historicalPoints.map((pt, idx) => (
                      <tr key={`${pt.dateLabel}-${idx}`}>
                        <td>{pt.dateLabel}</td>
                        <td>{pt.score}/100</td>
                        <td>{pt.exposedCount}</td>
                        <td>{pt.removedCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="pdf-summary-section">
            <h3 className="pdf-summary-section-title">
              Active Broker Exposure &amp; Suppression Status Ledger ({pdfSummaryData.brokerRows.length})
            </h3>
            <table className="pdf-summary-table">
              <thead>
                <tr>
                  <th>Broker &amp; Domain</th>
                  <th>Category</th>
                  <th>Risk</th>
                  <th>Exposed Fields</th>
                  <th>Channel / SLA</th>
                  <th>Status &amp; Receipt</th>
                </tr>
              </thead>
              <tbody>
                {pdfSummaryData.brokerRows.map((row) => (
                  <tr key={row.brokerId}>
                    <td>
                      <strong>{row.brokerName}</strong>
                      <span className="pdf-summary-domain">{row.domain}</span>
                    </td>
                    <td>{row.category}</td>
                    <td>
                      <span
                        className={
                          row.risk === 'Critical'
                            ? 'pdf-summary-risk-critical'
                            : row.risk === 'High'
                            ? 'pdf-summary-risk-high'
                            : 'pdf-summary-risk-medium'
                        }
                      >
                        {row.risk}
                      </span>
                    </td>
                    <td>{row.exposedDataSummary || 'Name, City/State'}</td>
                    <td>{row.channelAndSla}</td>
                    <td>
                      <span
                        className={
                          row.statusLabel === 'Verified Removed'
                            ? 'pdf-summary-status-done'
                            : row.statusLabel === 'Action Pending'
                            ? 'pdf-summary-status-pending'
                            : 'pdf-summary-status-sent'
                        }
                      >
                        {row.statusLabel}
                      </span>
                      {row.receiptSummary !== '—' && (
                        <span className="pdf-summary-domain">{row.receiptSummary}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pdf-summary-footer-note">
            Statutory Privacy Documentation — Prepared for consumer record suppression tracking
            under CCPA/CPRA (Cal. Civ. Code § 1798.105 &amp; Delete Act SB 362), TDPSA (Tex. Bus.
            &amp; Com. Code § 541.051), VCDPA, CPA, CTDPA, OCPA, and applicable state data-broker
            opt-out statutes. Retain confirmation receipts for 45-day statutory cure enforcement.
          </div>
        </div>
      </div>

      {/* Broker-Specific Privacy Tactics Modal */}
      {activeTacticsModal && (
        <PrivacyTacticsModal
          broker={activeTacticsModal.broker}
          result={activeTacticsModal.result}
          effectiveOptOutUrlOverride={
            resolveBrokerContactProfile(activeTacticsModal.broker, contactOverrides).optOutUrl
          }
          returnFocusElement={activeTacticsModal.triggerEl}
          onClose={() => setActiveTacticsModal(null)}
        />
      )}
    </div>
  );
};
