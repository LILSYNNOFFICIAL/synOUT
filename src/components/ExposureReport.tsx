import React, { useState } from 'react';
import { DataBroker, ScanResult, ScanStats, UserProfile } from '../types';
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
import { exportExposureReportCsv } from '../utils/csvExport';
import {
  resolveBrokerContactProfile,
  useBrokerContactOverrides,
} from '../utils/brokerContactResolver';
import { hasWebFormSubmission } from '../utils/optOutFormEngine';
import {
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
} from 'lucide-react';

interface ExposureReportProps {
  results: ScanResult[];
  stats: ScanStats;
  profile: UserProfile;
  relistedBrokerIds?: string[];
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
}

export const ExposureReport: React.FC<ExposureReportProps> = ({
  results,
  stats,
  profile,
  relistedBrokerIds = [],
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
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedRisk, setSelectedRisk] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'risk' | 'name' | 'records'>('risk');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [selectedBrokerIds, setSelectedBrokerIds] = useState<string[]>([]);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

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

  const handleExportPdf = () => {
    triggerPrintablePdf(results, stats, profile);
    setExportDropdownOpen(false);
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8">
      {/* Regression Banner when previously actioned brokers re-appear */}
      {relistedBrokerIds.length > 0 && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-rose-300">
                Re-Exposure Regression Detected ({relistedBrokerIds.length} Broker{relistedBrokerIds.length === 1 ? '' : 's'}):{' '}
              </span>
              <span className="text-slate-300">
                {relistedBrokerIds
                  .map((id) => findBrokerById(id)?.name || id)
                  .join(', ')}{' '}
                re-indexed your personal details after a prior suppression action. Re-send opt-out notices immediately.
              </span>
            </div>
          </div>
          {onBatchOptOutSelected && (
            <button
              type="button"
              onClick={() => onBatchOptOutSelected(relistedBrokerIds)}
              className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold cursor-pointer whitespace-nowrap shrink-0"
            >
              Re-Suppress {relistedBrokerIds.length} Regression{relistedBrokerIds.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      )}

      {/* Top Dossier Summary Header */}
      <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-3xl space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" /> High Exposure Detected
              </span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span className="text-slate-400">
                Audited: {profile.firstName} {profile.lastName} ({profile.currentCity}, {profile.currentState})
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              Data Broker Exposure &amp; Public Dossier Report
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl">
              We identified <strong className="text-white tabular-nums">{stats.exposedBrokers} data brokers</strong> actively advertising your private contact details, address records, and background profiles for public sale.
            </p>
          </div>

          {/* Action Center: Export Findings & Batch Removal */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <button
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-2 shadow-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Export Dossier (7 Formats)</span>
              </button>

              {exportDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-30 space-y-1">
                  <button
                    onClick={handleExportPdf}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800 flex items-center justify-between cursor-pointer"
                  >
                    <span>Printable PDF (.pdf)</span>
                    <Printer className="w-3.5 h-3.5 text-rose-400" />
                  </button>
                  <button
                    onClick={handleExportCsv}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800 flex items-center justify-between cursor-pointer"
                  >
                    <span>Spreadsheet Ledger (.csv)</span>
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  </button>
                  <button
                    onClick={handleExportMarkdown}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800 flex items-center justify-between cursor-pointer"
                  >
                    <span>Markdown Dossier (.md)</span>
                    <FileText className="w-3.5 h-3.5 text-sky-400" />
                  </button>
                  <button
                    onClick={handleExportPlainText}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800 flex items-center justify-between cursor-pointer"
                  >
                    <span>Plain Text Report (.txt)</span>
                    <FileText className="w-3.5 h-3.5 text-emerald-400" />
                  </button>
                  <button
                    onClick={handleExportMe}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800 flex items-center justify-between cursor-pointer"
                  >
                    <span>UNIX roff Document (.me)</span>
                    <FileText className="w-3.5 h-3.5 text-purple-400" />
                  </button>
                  <button
                    onClick={handleExportAsciiDoc}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800 flex items-center justify-between cursor-pointer"
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
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-emerald-300 hover:text-white hover:bg-slate-800 flex items-center justify-between cursor-pointer border-t border-slate-800 pt-2"
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
                className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-extrabold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap tabular-nums"
              >
                <Mail className="w-4 h-4" />
                <span>Opt Out Selected ({selectedBrokerIds.length})</span>
              </button>
            )}

            <button
              onClick={onBatchOptOut}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer whitespace-nowrap tabular-nums"
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
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white border border-red-400/30 text-xs font-extrabold flex items-center gap-2 shadow-lg shadow-red-600/25 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Flame className="w-4 h-4" />
                <span>NUKE ALL</span>
              </button>
            )}
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 tabular-nums">
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">Exposed Brokers</span>
            <span className="text-2xl font-extrabold text-rose-400 font-mono">{stats.exposedBrokers}</span>
          </div>

          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">Critical Severity</span>
            <span className="text-2xl font-extrabold text-rose-500 font-mono">{stats.criticalBrokers}</span>
          </div>

          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">Estimated Records</span>
            <span className="text-2xl font-extrabold text-white font-mono">{stats.totalRecordsExposed}</span>
          </div>

          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">Removals In Progress</span>
            <span className="text-2xl font-extrabold text-emerald-400 font-mono">{stats.inProgressRemovals}</span>
          </div>
        </div>

        {/* Secondary Analysis & Verification Bar */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenVectorModal}
              className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              Risk Vectors Breakdown
            </button>
            <button
              type="button"
              onClick={onOpenAuditLogModal}
              className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              Statutory Audit Proof Log
            </button>
            <button
              type="button"
              onClick={onOpenResurfaceModal}
              className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              Resurface Defense Monitor
            </button>
            {onOpenDeindexCenter && (
              <button
                type="button"
                onClick={onOpenDeindexCenter}
                className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-sky-400 hover:text-sky-300 font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                Search Engine De-Indexing
              </button>
            )}
            {onOpenFirewallHub && (
              <button
                type="button"
                onClick={onOpenFirewallHub}
                className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-emerald-300 hover:text-emerald-200 font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                Public Records &amp; Canaries
              </button>
            )}
            {onOpenReplyTriage && (
              <button
                type="button"
                onClick={onOpenReplyTriage}
                className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-amber-300 hover:text-amber-200 font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                Triage Broker Reply
              </button>
            )}
            {onOpenWebFormWorkbench && (
              <button
                type="button"
                onClick={() => onOpenWebFormWorkbench()}
                className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-emerald-500/30 text-emerald-300 hover:text-emerald-200 font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <FileCode2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Opt-Out Page Finder &amp; Forms</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onReScan}
            className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-emerald-400 font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Re-Run Audit Scan</span>
          </button>
        </div>
      </div>

      {/* Filter, Multi-Select & Sort Controls */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter by broker name, domain, or leaked data..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {filteredItems.length > 0 && (
            <button
              type="button"
              onClick={handleToggleSelectAllFiltered}
              className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 font-medium cursor-pointer whitespace-nowrap tabular-nums"
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
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="all">All Categories</option>
            <option value="People Search">People Search</option>
            <option value="Financial & Credit Marketing">Financial &amp; Credit</option>
            <option value="Real Estate & Property">Property &amp; Deeds</option>
            <option value="Arrest & Court Records">Court Records</option>
            <option value="Vehicle & Asset Registry">Vehicle &amp; Assets</option>
            <option value="B2B & Professional Intelligence">B2B &amp; Executive</option>
          </select>

          <select
            value={selectedRisk}
            onChange={(e) => setSelectedRisk(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="all">All Risks</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'risk' | 'name' | 'records')}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none cursor-pointer"
            aria-label="Sort exposed brokers"
          >
            <option value="risk">Sort: Highest Risk</option>
            <option value="records">Sort: Most Records</option>
            <option value="name">Sort: Alphabetical</option>
          </select>

          <div className="flex items-center border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                className={`p-6 bg-slate-900 border rounded-3xl space-y-4 transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'border-emerald-500/70'
                    : isRelisted
                    ? 'border-rose-500/50'
                    : 'border-slate-800 hover:border-slate-700'
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
                        <span className="text-[10px] font-mono text-slate-400 block">
                          {broker.category} · {broker.removalMethod}
                        </span>
                        <h3 className="text-base font-bold text-white mt-0.5 truncate">
                          {broker.name}
                        </h3>
                        <p className="text-xs text-slate-500 font-mono truncate">{broker.domain}</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          broker.risk === 'Critical'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}
                      >
                        {broker.risk} Risk
                      </span>
                      {isRelisted && (
                        <span className="text-[10px] font-mono font-semibold text-rose-400">
                          Re-Listed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Leaked Attributes */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] text-slate-400 font-medium">Exposed PII:</span>
                    <div className="flex flex-wrap gap-1">
                      {broker.dataExposedList.slice(0, 3).map((item, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-md bg-slate-950 text-[10px] font-medium text-slate-300 border border-slate-800"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Direct Link to Regular Web Finding & Opt-Out */}
                  <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-xs">
                    <a
                      href={searchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center justify-between text-sky-400 hover:text-sky-300 transition-colors"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                        Inspect Record on Site
                      </span>
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>

                    <a
                      href={contact.optOutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center justify-between text-slate-300 hover:text-white transition-colors gap-2"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <ExternalLink className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        <span className="truncate">
                          {contact.discoveredOptOutTitle
                            ? `Opt-Out: ${contact.discoveredOptOutTitle}`
                            : 'Official Opt-Out Link'}
                        </span>
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono tabular-nums shrink-0">
                        {broker.removalTime}
                      </span>
                    </a>
                  </div>
                </div>

                {/* Removal Action Button */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-1.5">
                  <button
                    onClick={() => onOpenListingModal(broker, result)}
                    className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title="View Full Profile Dossier"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onOpenLegalNotice(broker, result)}
                    className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title="Generate Custom CCPA Notice"
                  >
                    <FileText className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onOpenDiyAssistantModal(broker, result)}
                    className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer text-[11px] font-semibold"
                    title="Step-by-Step DIY Opt-Out Guide"
                  >
                    DIY
                  </button>

                  {onOpenWebFormWorkbench && (
                    <button
                      type="button"
                      onClick={() => onOpenWebFormWorkbench(broker)}
                      className={`px-2.5 py-2 rounded-xl border text-[11px] font-semibold transition-colors cursor-pointer inline-flex items-center gap-1 whitespace-nowrap ${
                        isFormSubmitted
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-slate-950 hover:bg-slate-800 text-emerald-300 border-slate-800'
                      }`}
                      title="Discover Opt-Out Page & Auto-Fill Web Form"
                    >
                      <FileCode2 className="w-3.5 h-3.5" />
                      <span>{isFormSubmitted ? 'Form Done' : 'Form'}</span>
                    </button>
                  )}

                  <button
                    onClick={() => onAutomatedOptOut(broker.id)}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      isRemoved
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : isDispatched
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md'
                    }`}
                  >
                    {isRemoved ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5" /> Expunged
                      </>
                    ) : isDispatched ? (
                      <>
                        <Clock className="w-3.5 h-3.5" /> Email Sent
                      </>
                    ) : (
                      <>
                        <Mail className="w-3.5 h-3.5" /> Send Opt-Out Email
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-3 pr-2 w-8">
                  <input
                    type="checkbox"
                    checked={areAllFilteredSelected}
                    onChange={handleToggleSelectAllFiltered}
                    aria-label="Select all filtered brokers"
                    className="rounded border-slate-700 bg-slate-950 text-emerald-500 cursor-pointer"
                  />
                </th>
                <th className="pb-3 font-semibold">Entity Name</th>
                <th className="pb-3 font-semibold">Category</th>
                <th className="pb-3 font-semibold">Risk Level</th>
                <th className="pb-3 font-semibold">Public Record Link</th>
                <th className="pb-3 font-semibold">Opt-Out Portal</th>
                <th className="pb-3 font-semibold">Removal Status</th>
                <th className="pb-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredItems.map((result) => {
                const broker = findBrokerById(result.brokerId);
                if (!broker) return null;
                const contact = resolveBrokerContactProfile(broker, contactOverrides);
                const searchUrl = getBrokerRecordSearchUrl(broker, profile);
                const isSelected = selectedBrokerIds.includes(broker.id);
                const emailSent = hasVerifiedEmailReceipt(result);
                const formSent = hasWebFormSubmission(result);

                return (
                  <tr key={result.id} className="hover:bg-slate-950/40">
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
                      <strong className="text-white block">{broker.name}</strong>
                      <span className="text-slate-500 font-mono text-[11px]">{broker.domain}</span>
                    </td>
                    <td className="py-3 text-slate-300">{broker.category}</td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          broker.risk === 'Critical' ? 'text-rose-400 bg-rose-500/10' : 'text-amber-400 bg-amber-500/10'
                        }`}
                      >
                        {broker.risk}
                      </span>
                    </td>
                    <td className="py-3">
                      <a
                        href={searchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 hover:underline flex items-center gap-1 whitespace-nowrap"
                      >
                        Inspect Record <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </td>
                    <td className="py-3">
                      <a
                        href={contact.optOutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:underline flex items-center gap-1 whitespace-nowrap"
                      >
                        Opt-Out Page <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${
                          result.removalStatus === 'removed'
                            ? 'text-emerald-400 bg-emerald-500/10'
                            : emailSent && formSent
                            ? 'text-emerald-300 bg-emerald-500/10'
                            : emailSent
                            ? 'text-sky-400 bg-sky-500/10'
                            : formSent
                            ? 'text-emerald-400 bg-emerald-500/10'
                            : 'text-amber-400 bg-amber-500/10'
                        }`}
                      >
                        {result.removalStatus === 'removed'
                          ? 'removed'
                          : emailSent && formSent
                          ? 'form + email'
                          : emailSent
                          ? 'email sent'
                          : formSent
                          ? 'form submitted'
                          : 'exposed'}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onOpenDiyAssistantModal(broker, result)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold text-xs cursor-pointer"
                        >
                          DIY
                        </button>
                        {onOpenWebFormWorkbench && (
                          <button
                            type="button"
                            onClick={() => onOpenWebFormWorkbench(broker)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-emerald-300 font-semibold text-xs cursor-pointer whitespace-nowrap"
                          >
                            Form
                          </button>
                        )}
                        <button
                          onClick={() => onAutomatedOptOut(broker.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap"
                        >
                          Send Opt-Out
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
    </div>
  );
};
