import React, { useState, useMemo } from 'react';
import { DataBroker, DeindexItem, DeindexStatus, ScanResult, SearchEngineId, UserProfile } from '../types';
import {
  SEARCH_ENGINE_PORTALS,
  buildBrokerSearchEngineDorks,
  buildDeindexCandidatesFromScan,
  buildWebmasterCachePurgeNotice,
  updateDeindexItemStatus,
} from '../utils/searchDeindexEngine';
import {
  useEmailConnection,
  sendEmailViaConnectedAccount,
} from '../services/emailConnectionStore';
import {
  Search,
  ExternalLink,
  Globe,
  Mail,
  Send,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

interface SearchEngineDeindexCenterProps {
  profile: UserProfile;
  results: ScanResult[];
  deindexQueue: DeindexItem[];
  onUpdateDeindexQueue: (nextQueue: DeindexItem[]) => void;
  onOpenConnectEmail?: () => void;
  onStartScan?: () => void;
}

export const SearchEngineDeindexCenter: React.FC<SearchEngineDeindexCenterProps> = ({
  profile,
  results,
  deindexQueue,
  onUpdateDeindexQueue,
  onOpenConnectEmail,
  onStartScan,
}) => {
  const { isDirectSendConnected, activeConnectedEmail } = useEmailConnection();
  const [selectedPortalId, setSelectedPortalId] = useState<SearchEngineId>('google');
  const [customUrl, setCustomUrl] = useState('');
  const [customBrokerName, setCustomBrokerName] = useState('');
  const [customEngine, setCustomEngine] = useState<SearchEngineId>('google');
  const [statusFilter, setStatusFilter] = useState<'all' | DeindexStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Inline webmaster cache-purge email confirmation state
  const [emailTarget, setEmailTarget] = useState<{
    broker: DataBroker;
    targetUrl: string;
  } | null>(null);
  const [bccSelf, setBccSelf] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastSentBanner, setLastSentBanner] = useState<string | null>(null);

  const selectedPortal =
    SEARCH_ENGINE_PORTALS.find((p) => p.id === selectedPortalId) || SEARCH_ENGINE_PORTALS[0];

  const exposedCandidates = useMemo(
    () => buildDeindexCandidatesFromScan(results, profile),
    [results, profile]
  );

  const stats = useMemo(() => {
    const detected = deindexQueue.filter((i) => i.status === 'detected').length;
    const submitted = deindexQueue.filter((i) => i.status === 'submitted_to_engine').length;
    const cacheEmailed = deindexQueue.filter((i) => i.status === 'cache_purge_emailed').length;
    const deindexed = deindexQueue.filter((i) => i.status === 'deindexed').length;
    return { detected, submitted, cacheEmailed, deindexed };
  }, [deindexQueue]);

  const handleAddQueueItem = (
    url: string,
    brokerName: string,
    engine: SearchEngineId,
    brokerId?: string,
    initialStatus: DeindexStatus = 'detected',
    emailReceipt?: string
  ) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    const existing = deindexQueue.find(
      (i) => i.url === trimmedUrl && i.engine === engine
    );
    const nowIso = new Date().toISOString();
    if (existing) {
      const updated = updateDeindexItemStatus(
        deindexQueue,
        existing.id,
        initialStatus,
        emailReceipt
      );
      onUpdateDeindexQueue(updated);
      return;
    }

    const created: DeindexItem = {
      id: `deidx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      url: trimmedUrl,
      brokerId,
      brokerName: brokerName.trim() || 'Exposed Web Page',
      engine,
      status: initialStatus,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      emailReceipt,
    };
    onUpdateDeindexQueue([created, ...deindexQueue]);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim()) return;
    let derivedHost = customBrokerName.trim();
    if (!derivedHost) {
      try {
        derivedHost = new URL(customUrl.trim()).hostname.replace(/^www\./, '');
      } catch {
        derivedHost = 'Search Result Snippet';
      }
    }
    handleAddQueueItem(customUrl.trim(), derivedHost, customEngine);
    setCustomUrl('');
    setCustomBrokerName('');
  };

  const handleStatusChange = (itemId: string, nextStatus: DeindexStatus) => {
    onUpdateDeindexQueue(updateDeindexItemStatus(deindexQueue, itemId, nextStatus));
  };

  const handleDeleteItem = (itemId: string) => {
    onUpdateDeindexQueue(deindexQueue.filter((i) => i.id !== itemId));
  };

  const handleSendCachePurgeEmail = async () => {
    if (!emailTarget || !emailTarget.broker.privacyEmail) return;
    setIsSending(true);
    setSendError(null);
    try {
      const fullName = `${profile.firstName} ${profile.lastName}`.trim() || 'Authorized Consumer';
      const notice = buildWebmasterCachePurgeNotice(
        emailTarget.targetUrl,
        emailTarget.broker.name,
        emailTarget.broker.domain,
        emailTarget.broker.privacyEmail,
        profile,
        activeConnectedEmail || undefined
      );

      const res = await sendEmailViaConnectedAccount({
        recipientEmail: emailTarget.broker.privacyEmail,
        subject: notice.subject,
        body: notice.body,
        senderName: fullName,
        brokerId: `deindex-${emailTarget.broker.id}`,
        brokerName: emailTarget.broker.name,
        brokerDomain: emailTarget.broker.domain,
        bccSelf,
      });

      handleAddQueueItem(
        emailTarget.targetUrl,
        emailTarget.broker.name,
        selectedPortalId,
        emailTarget.broker.id,
        'cache_purge_emailed',
        res.messageId
      );
      setLastSentBanner(
        `Sent HTTP 410 / noindex cache-purge demand to ${emailTarget.broker.privacyEmail} (Receipt: ${res.messageId})`
      );
      setEmailTarget(null);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send cache-purge notice.');
    } finally {
      setIsSending(false);
    }
  };

  const filteredQueue = deindexQueue.filter((item) => {
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchesText =
      !searchQuery.trim() ||
      item.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.brokerName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesText;
  });

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400">
              <span className="text-sky-400 font-semibold">Search Engine De-Indexing &amp; Cache Purge</span>
              <span aria-hidden="true">·</span>
              <span>Google · Bing · DuckDuckGo · Yahoo · Brave</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Search Snippet &amp; Outdated Cache Neutralization
            </h1>
            <p className="text-sm text-slate-400 max-w-3xl leading-relaxed">
              Even after a data broker deletes your listing, search engines often retain cached phone numbers and home addresses in organic snippets for weeks. Audit live SERP exposure, submit outdated-cache purges, and dispatch HTTP 410 / noindex demands to broker webmasters.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href="https://search.google.com/search-console/remove-outdated-content"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <span>Google Outdated Cache Tool</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a
              href="https://www.bing.com/webmasters/tools/contentremoval"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-xl glass-subtle hover:border-white/20 text-slate-200 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <span>Bing Content Removal</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Hairline-Divided Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06] border-t border-white/[0.08] pt-5 tabular-nums">
          <div className="py-2 sm:py-0 sm:pr-5">
            <span className="text-[11px] text-slate-400 block">Queued URLs</span>
            <span className="text-2xl font-bold text-amber-400 font-mono">{stats.detected}</span>
          </div>
          <div className="py-2 sm:py-0 sm:px-5">
            <span className="text-[11px] text-slate-400 block">Submitted to Search</span>
            <span className="text-2xl font-bold text-sky-400 font-mono">{stats.submitted}</span>
          </div>
          <div className="py-2 sm:py-0 sm:px-5">
            <span className="text-[11px] text-slate-400 block">Cache Demands Sent</span>
            <span className="text-2xl font-bold text-indigo-300 font-mono">{stats.cacheEmailed}</span>
          </div>
          <div className="py-2 sm:py-0 sm:pl-5">
            <span className="text-[11px] text-slate-400 block">Verified De-Indexed</span>
            <span className="text-2xl font-bold text-emerald-400 font-mono">{stats.deindexed}</span>
          </div>
        </div>
      </div>

      {lastSentBanner && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{lastSentBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setLastSentBanner(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search Engine Portal Workflow Selector */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {SEARCH_ENGINE_PORTALS.map((portal) => (
              <button
                key={portal.id}
                type="button"
                onClick={() => setSelectedPortalId(portal.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  selectedPortalId === portal.id
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                {portal.name}
              </button>
            ))}
          </div>
          <span className="text-xs font-mono text-slate-400">
            Turnaround: <strong className="text-slate-200">{selectedPortal.turnaround}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 space-y-2.5">
            <div className="text-xs font-mono text-slate-400">
              Crawler Source: <span className="text-slate-200">{selectedPortal.indexSource}</span>
            </div>
            <ol className="space-y-2">
              {selectedPortal.steps.map((step, idx) => (
                <li
                  key={idx}
                  className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 flex items-start gap-2.5"
                >
                  <span className="font-mono font-bold text-emerald-400 tabular-nums shrink-0">
                    0{idx + 1}.
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="lg:col-span-4 p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 text-xs">
            <h3 className="font-bold text-white">Official {selectedPortal.name} Portals</h3>
            <a
              href={selectedPortal.personalPiiRemovalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-emerald-400 font-semibold flex items-center justify-between transition-colors"
            >
              <span>Personal PII / Doxxing Removal</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>
            <a
              href={selectedPortal.outdatedCacheUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sky-400 font-semibold flex items-center justify-between transition-colors"
            >
              <span>Outdated 404 / Stale Snippet Purge</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>
          </div>
        </div>
      </div>

      {/* Inline Webmaster Cache-Purge Email Confirmation */}
      {emailTarget && (
        <div className="p-5 bg-slate-900 border border-emerald-500/40 rounded-2xl space-y-3 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="font-bold text-white text-sm">
                Send HTTP 410 / X-Robots-Tag Cache Purge Notice to {emailTarget.broker.name}
              </div>
              <p className="text-slate-400">
                Sending from{' '}
                <strong className="text-emerald-400 font-mono">
                  {activeConnectedEmail || 'Not Connected'}
                </strong>{' '}
                to <strong className="font-mono text-white">{emailTarget.broker.privacyEmail}</strong>{' '}
                for URL <span className="font-mono text-sky-400">{emailTarget.targetUrl}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setEmailTarget(null);
                  setSendError(null);
                }}
                disabled={isSending}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              {isDirectSendConnected ? (
                <button
                  type="button"
                  onClick={handleSendCachePurgeEmail}
                  disabled={isSending}
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  {isSending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>{isSending ? 'Sending...' : 'Confirm & Send Email'}</span>
                </button>
              ) : (
                onOpenConnectEmail && (
                  <button
                    type="button"
                    onClick={onOpenConnectEmail}
                    className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Connect Email First</span>
                  </button>
                )
              )}
            </div>
          </div>

          {isDirectSendConnected && (
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer pt-2 border-t border-slate-800">
              <input
                type="checkbox"
                checked={bccSelf}
                onChange={(e) => setBccSelf(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-emerald-500"
              />
              <span>BCC a copy to my inbox ({activeConnectedEmail})</span>
            </label>
          )}

          {sendError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{sendError}</span>
            </div>
          )}
        </div>
      )}

      {/* Exposed Broker SERP Dork Matrix */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-white">
              Live Search Engine Site-Dork Inspector ({profile.firstName} {profile.lastName})
            </h2>
            <p className="text-xs text-slate-400">
              Click any engine below to inspect live cached snippets on that broker domain, queue exposed URLs, or email a cache-purge notice.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400 tabular-nums">
            {exposedCandidates.length} Exposed Domains
          </span>
        </div>

        {exposedCandidates.length === 0 ? (
          <div className="p-8 bg-slate-950 border border-slate-800 rounded-xl text-center space-y-3">
            <p className="text-xs text-slate-400">
              Run an Exposure Audit Scan to automatically generate targeted search-engine dork queries for every exposed broker domain.
            </p>
            {onStartScan && (
              <button
                type="button"
                onClick={onStartScan}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                Run Exposure Scan
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {exposedCandidates.map(({ broker, recordUrl, result }) => {
              const dorks = buildBrokerSearchEngineDorks(broker.domain, profile);
              return (
                <div
                  key={result.id}
                  className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-white text-sm">{broker.name}</strong>
                      <span className="text-slate-500 font-mono">({broker.domain})</span>
                      {result.removalStatus === 'removed' && (
                        <span className="text-emerald-400 font-mono text-[11px]">
                          · Broker Scrubbed (Ready for 404 Cache Purge)
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono truncate">
                      Query: {dorks[0].query}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {dorks.map((dork) => (
                      <a
                        key={dork.engine}
                        href={dork.searchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sky-400 font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                      >
                        <span>{dork.engineLabel}</span>
                        <ExternalLink className="w-3 h-3 text-slate-500" />
                      </a>
                    ))}

                    <button
                      type="button"
                      onClick={() =>
                        handleAddQueueItem(recordUrl, broker.name, selectedPortalId, broker.id)
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Track URL</span>
                    </button>

                    {broker.privacyEmail && (
                      <button
                        type="button"
                        onClick={() => {
                          setSendError(null);
                          setEmailTarget({ broker, targetUrl: recordUrl });
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Cache Purge Email</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Custom Exposed URL Logger + Tracked De-Index Queue */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-5">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-white">
            Tracked Search Snippet &amp; Cache Removal Queue
          </h2>
          <p className="text-xs text-slate-400">
            Paste any exact search result URL exposing your personal data to track its de-indexing lifecycle across Google, Bing, DuckDuckGo, Yahoo, and Brave.
          </p>
        </div>

        <form onSubmit={handleCustomSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
          <input
            type="url"
            required
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="https://spokeo.com/Jane-Doe/California/..."
            className="md:col-span-6 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
          <input
            type="text"
            value={customBrokerName}
            onChange={(e) => setCustomBrokerName(e.target.value)}
            placeholder="Source / Site Label (optional)"
            className="md:col-span-3 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
          <select
            value={customEngine}
            onChange={(e) => setCustomEngine(e.target.value as SearchEngineId)}
            className="md:col-span-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 cursor-pointer focus:outline-none"
          >
            <option value="google">Google</option>
            <option value="bing">Bing</option>
            <option value="duckduckgo">DuckDuckGo</option>
            <option value="yahoo">Yahoo</option>
            <option value="brave">Brave</option>
          </select>
          <button
            type="submit"
            className="md:col-span-1 px-3 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add</span>
          </button>
        </form>

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800 text-xs">
          <div className="relative max-w-xs w-full">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter tracked URLs..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-white placeholder-slate-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['all', 'All'],
                ['detected', 'Detected'],
                ['submitted_to_engine', 'Submitted to Search'],
                ['cache_purge_emailed', 'Cache Emailed'],
                ['deindexed', 'De-Indexed'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setStatusFilter(val)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  statusFilter === val
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Queue Rows */}
        {filteredQueue.length === 0 ? (
          <div className="p-8 bg-slate-950 border border-slate-800 rounded-xl text-center text-xs text-slate-400">
            No URLs in your de-index queue yet. Click "Track URL" on any exposed broker above or paste a live search snippet URL.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredQueue.map((item) => (
              <div
                key={item.id}
                className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-white">{item.brokerName}</span>
                    <span aria-hidden="true" className="text-slate-600">
                      ·
                    </span>
                    <span className="font-mono uppercase text-[11px] text-sky-400">
                      {item.engine}
                    </span>
                    <span
                      className={`font-mono text-[11px] ${
                        item.status === 'deindexed'
                          ? 'text-emerald-400'
                          : item.status === 'submitted_to_engine' ||
                            item.status === 'cache_purge_emailed'
                          ? 'text-sky-400'
                          : 'text-amber-400'
                      }`}
                    >
                      · {item.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[11px] text-slate-400 hover:text-sky-400 truncate block"
                  >
                    {item.url}
                  </a>
                  {item.emailReceipt && (
                    <div className="font-mono text-[11px] text-emerald-400 truncate">
                      SMTP Receipt: {item.emailReceipt}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {item.status !== 'submitted_to_engine' && item.status !== 'deindexed' && (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(item.id, 'submitted_to_engine')}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sky-400 font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Mark Submitted
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      handleStatusChange(
                        item.id,
                        item.status === 'deindexed' ? 'submitted_to_engine' : 'deindexed'
                      )
                    }
                    className={`px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                      item.status === 'deindexed'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-800 hover:bg-slate-700 text-white'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{item.status === 'deindexed' ? 'De-Indexed (Undo)' : 'Confirm De-Indexed'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-900 cursor-pointer"
                    title="Remove from queue"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
