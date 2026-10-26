import React, { useState, useMemo } from 'react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import { getAccessToken, googleSignIn } from '../services/googleAuth';
import { scanBrokerInboxForHarvester } from '../services/gmailApi';
import { findBrokerById, useEmailConnection } from '../services/emailConnectionStore';
import { sessionFetch } from '../services/sessionClient';
import { getExhaustiveBrokerRegistry } from '../utils/dynamicBrokerRegistry';
import {
  HarvestedBrokerInboxItem,
  harvestBrokerEmailPayload,
} from '../utils/inboxHarvesterEngine';
import { markBrokerEmailBounced } from '../utils/brokerContactResolver';
import { copyTextToClipboard } from '../utils/exportEngines';
import {
  Inbox,
  RefreshCw,
  CheckCircle2,
  ExternalLink,
  Play,
  Mail,
  AlertTriangle,
  Copy,
  Check,
  FileText,
  Bot,
  ArrowRight,
} from 'lucide-react';

interface InboxHarvesterCenterProps {
  results: ScanResult[];
  profile: UserProfile;
  onVerificationLinkCompleted: (params: {
    broker: DataBroker | null;
    matchedDomain: string;
    confirmationCode: string | null;
    finalUrl: string;
    evidenceSha256: string;
    summary: string;
  }) => void;
  onBrokerConfirmedRemoved: (
    brokerId: string,
    ticketId: string | null,
    summaryNote: string
  ) => void;
  onBrokerTicketLogged: (
    brokerId: string,
    ticketId: string | null,
    summaryNote: string
  ) => void;
  onOpenConnectEmail: () => void;
  onOpenWebFormWorkbench: (broker?: DataBroker) => void;
  onOpenReplyTriage: (broker?: DataBroker, result?: ScanResult) => void;
}

interface VerificationExecutionStatus {
  running: boolean;
  done: boolean;
  verified: boolean;
  summary: string;
  confirmationCode?: string | null;
  evidenceSha256?: string;
}

export const InboxHarvesterCenter: React.FC<InboxHarvesterCenterProps> = ({
  results,
  onVerificationLinkCompleted,
  onBrokerConfirmedRemoved,
  onBrokerTicketLogged,
  onOpenConnectEmail,
  onOpenWebFormWorkbench,
  onOpenReplyTriage,
}) => {
  const { oauthUser, oauthConfigured, activeConnectedEmail } = useEmailConnection();
  const [items, setItems] = useState<HarvestedBrokerInboxItem[]>([]);
  const [isScanningInbox, setIsScanningInbox] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastScannedIso, setLastScannedIso] = useState<string | null>(null);
  const [execStateById, setExecStateById] = useState<Record<string, VerificationExecutionStatus>>({});
  const [isBatchRunning, setIsBatchRunning] = useState(false);

  // Paste Raw Confirmation Email Drawer (for SMTP / Proton / Outlook / Yahoo users)
  const [showPasteDrawer, setShowPasteDrawer] = useState(false);
  const [rawSenderInput, setRawSenderInput] = useState('');
  const [rawSubjectInput, setRawSubjectInput] = useState('');
  const [rawBodyInput, setRawBodyInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const registry = useMemo(() => getExhaustiveBrokerRegistry(), []);

  const activeQueueDomains = useMemo(() => {
    const domains: string[] = [];
    for (const r of results) {
      if (r.status === 'exposed' || r.removalStatus === 'submitted') {
        const b = findBrokerById(r.brokerId);
        if (b?.domain) domains.push(b.domain);
      }
    }
    if (domains.length === 0) {
      return registry.slice(0, 12).map((b) => b.domain);
    }
    return Array.from(new Set(domains));
  }, [results, registry]);

  const readyLinkItems = useMemo(
    () =>
      items.filter(
        (i) =>
          i.safeVerificationLinks.length > 0 &&
          !execStateById[i.id]?.verified
      ),
    [items, execStateById]
  );

  const handleScanConnectedGmail = async () => {
    setScanError(null);
    setIsScanningInbox(true);
    try {
      let token = await getAccessToken();
      if (!token) {
        if (!oauthConfigured) {
          throw new Error(
            'Connect Google OAuth in Email settings to scan Gmail automatically, or paste any broker confirmation email below.'
          );
        }
        const authRes = await googleSignIn({
          loginHint: oauthUser?.email || activeConnectedEmail || undefined,
        });
        token = authRes.accessToken;
      }

      const rawMessages = await scanBrokerInboxForHarvester(token, activeQueueDomains, 14);
      const harvested = rawMessages.map((msg) =>
        harvestBrokerEmailPayload({
          id: `gmail-${msg.id}`,
          messageId: msg.id,
          threadId: msg.threadId,
          from: msg.from || 'Unknown Sender',
          subject: msg.subject || 'No Subject',
          date: msg.date || '',
          bodyText: msg.bodyText || msg.snippet || '',
          snippet: msg.snippet,
          brokersPool: registry,
        })
      );

      setItems((prev) => {
        const manualItems = prev.filter((p) => p.id.startsWith('manual-'));
        return [...harvested, ...manualItems];
      });
      setLastScannedIso(new Date().toISOString());
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Failed scanning Gmail inbox.');
    } finally {
      setIsScanningInbox(false);
    }
  };

  const handleParsePastedEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawBodyInput.trim()) return;

    const parsed = harvestBrokerEmailPayload({
      id: `manual-${Date.now()}`,
      messageId: `MANUAL-${Date.now().toString(36).toUpperCase()}`,
      from: rawSenderInput.trim() || 'privacy@broker-portal',
      subject: rawSubjectInput.trim() || 'Confirm your opt-out request',
      date: new Date().toLocaleString(),
      bodyText: rawBodyInput,
      brokersPool: registry,
    });

    setItems((prev) => [parsed, ...prev]);
    setRawBodyInput('');
    setRawSubjectInput('');
    setRawSenderInput('');
    setShowPasteDrawer(false);
  };

  const executeSingleHarvestedItem = async (item: HarvestedBrokerInboxItem) => {
    const primaryLink = item.safeVerificationLinks[0];
    if (!primaryLink) return;

    const expectedDomain = item.broker?.domain || primaryLink.host;
    setExecStateById((prev) => ({
      ...prev,
      [item.id]: {
        running: true,
        done: false,
        verified: false,
        summary: 'Opening confirmation link in isolated headless Chromium...',
      },
    }));

    try {
      const res = await sessionFetch('/api/inbox/execute-verification-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationUrl: primaryLink.sanitizedUrl,
          expectedBrokerDomain: expectedDomain,
          brokerId: item.broker?.id,
          brokerName: item.broker?.name,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      const verified = Boolean(data.verified);
      const code = data.brokerConfirmationCode || item.extractedTicketId || null;
      const summary = String(data.summary || 'Confirmation link executed.');

      setExecStateById((prev) => ({
        ...prev,
        [item.id]: {
          running: false,
          done: true,
          verified,
          summary,
          confirmationCode: code,
          evidenceSha256: data.evidenceSha256,
        },
      }));

      if (verified) {
        onVerificationLinkCompleted({
          broker: item.broker,
          matchedDomain: expectedDomain,
          confirmationCode: code,
          finalUrl: data.finalUrl || primaryLink.sanitizedUrl,
          evidenceSha256: data.evidenceSha256 || '',
          summary,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Headless verification failed.';
      setExecStateById((prev) => ({
        ...prev,
        [item.id]: {
          running: false,
          done: true,
          verified: false,
          summary: msg,
        },
      }));
    }
  };

  const handleBatchExecuteAllLinks = async () => {
    if (readyLinkItems.length === 0) return;
    setIsBatchRunning(true);
    for (const item of readyLinkItems) {
      await executeSingleHarvestedItem(item);
    }
    setIsBatchRunning(false);
  };

  const handleApplyReplyOutcome = (item: HarvestedBrokerInboxItem) => {
    if (!item.broker) return;
    if (item.classification === 'removal_confirmed') {
      onBrokerConfirmedRemoved(
        item.broker.id,
        item.extractedTicketId,
        `Inbox Harvester confirmed deletion from "${item.subject}"`
      );
    } else if (item.classification === 'delivery_bounce') {
      for (const addr of item.bouncedAddresses) {
        markBrokerEmailBounced(item.broker.id, addr);
      }
      onOpenWebFormWorkbench(item.broker);
    } else if (item.classification === 'more_info_requested') {
      const existing = results.find((r) => r.brokerId === item.broker?.id);
      onOpenReplyTriage(item.broker, existing);
    } else {
      onBrokerTicketLogged(
        item.broker.id,
        item.extractedTicketId,
        `Inbox Harvester logged acknowledgment "${item.subject}"`
      );
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-6">
      {/* Header Surface */}
      <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
              <span className="text-emerald-400 font-medium">Autonomous Inbox Harvester</span>
              <span aria-hidden="true">·</span>
              <span>{activeQueueDomains.length} Broker Domains Scoped</span>
              <span aria-hidden="true">·</span>
              <span>{readyLinkItems.length} Confirmation Links Ready</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight [text-wrap:balance]">
              Email Verification Link &amp; Broker Reply Harvester
            </h1>
            <p className="text-sm text-slate-400 max-w-3xl leading-relaxed">
              Queries only messages matching data broker domains in your active queue, strips tracking
              tokens, validates HTTPS domain ownership, and executes one-time opt-out confirmation links
              in isolated headless Chromium.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleScanConnectedGmail}
              disabled={isScanningInbox}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanningInbox ? 'animate-spin' : ''}`} />
              <span>{isScanningInbox ? 'Scanning Broker Mail...' : 'Scan Connected Gmail'}</span>
            </button>

            {readyLinkItems.length > 0 && (
              <button
                type="button"
                onClick={handleBatchExecuteAllLinks}
                disabled={isBatchRunning}
                className="px-4 py-2.5 rounded-xl glass-subtle hover:border-emerald-400/40 text-emerald-300 text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap tabular-nums"
              >
                <Bot className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  {isBatchRunning
                    ? 'Executing Links...'
                    : `Confirm All (${readyLinkItems.length})`}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowPasteDrawer((v) => !v)}
              className="px-4 py-2.5 rounded-xl glass-subtle hover:border-white/20 text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>{showPasteDrawer ? 'Hide Paste Box' : 'Paste Confirmation Email'}</span>
            </button>
          </div>
        </div>

        {scanError && (
          <div className="glass-subtle rounded-xl p-4 border border-amber-400/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-200">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>{scanError}</span>
            </div>
            <button
              type="button"
              onClick={onOpenConnectEmail}
              className="px-3.5 py-1.5 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 text-amber-200 font-medium whitespace-nowrap shrink-0 cursor-pointer"
            >
              Connect Email
            </button>
          </div>
        )}
      </div>

      {/* Optional Manual Raw Email Paste Drawer for Non-Gmail / App-Password Users */}
      {showPasteDrawer && (
        <form onSubmit={handleParsePastedEmail} className="glass-panel rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              Extract Verification Link or Ticket from Any Email Provider (Outlook, Proton, Yahoo, iCloud)
            </h2>
            <span className="text-xs text-slate-400">Parsed locally · SSRF-validated</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Sender header (e.g. privacy@spokeo.com)"
              value={rawSenderInput}
              onChange={(e) => setRawSenderInput(e.target.value)}
              className="glass-input rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500"
            />
            <input
              type="text"
              placeholder="Email subject (e.g. Confirm your Spokeo opt-out)"
              value={rawSubjectInput}
              onChange={(e) => setRawSubjectInput(e.target.value)}
              className="glass-input rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500"
            />
          </div>

          <textarea
            rows={4}
            required
            placeholder="Paste the broker's confirmation email text or HTML source containing the verification URL or ticket number..."
            value={rawBodyInput}
            onChange={(e) => setRawBodyInput(e.target.value)}
            className="w-full glass-input rounded-xl p-3.5 text-xs text-white placeholder-slate-500 font-mono"
          />

          <div className="flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setShowPasteDrawer(false)}
              className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              Extract &amp; Validate Link
            </button>
          </div>
        </form>
      )}

      {/* Harvested Messages List */}
      {items.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center space-y-4">
          <div className="w-11 h-11 rounded-2xl glass-subtle mx-auto flex items-center justify-center text-emerald-400">
            <Inbox className="w-5 h-5" />
          </div>
          <div className="space-y-1.5 max-w-lg mx-auto">
            <h2 className="text-base font-semibold text-white">
              {lastScannedIso
                ? 'No Unprocessed Broker Verification Emails Found'
                : 'Ready to Harvest Confirmation Links & Broker Replies'}
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              {lastScannedIso
                ? 'All recent messages from your queued broker domains have been checked. Submit web-form opt-outs or check back once brokers send confirmation links.'
                : 'Click "Scan Connected Gmail" to inspect messages from active data brokers, or paste a confirmation email from any inbox.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleScanConnectedGmail}
              disabled={isScanningInbox}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Scan Connected Gmail</span>
            </button>
            <button
              type="button"
              onClick={() => setShowPasteDrawer(true)}
              className="px-5 py-2.5 rounded-xl glass-subtle hover:border-white/20 text-slate-200 text-xs font-medium cursor-pointer whitespace-nowrap"
            >
              Paste Email Body
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const exec = execStateById[item.id];
            const primarySafeLink = item.safeVerificationLinks[0];

            return (
              <div key={item.id} className="glass-card rounded-2xl p-5 space-y-3.5">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
                      <span className="font-semibold text-white">
                        {item.broker ? item.broker.name : item.matchedDomain}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-slate-400">{item.matchedDomain}</span>
                      {item.extractedTicketId && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-emerald-300">
                            Ticket {item.extractedTicketId}
                          </span>
                        </>
                      )}
                      {item.date && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{item.date}</span>
                        </>
                      )}
                    </div>

                    <h3 className="text-sm font-semibold text-slate-100 truncate">
                      {item.subject}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2">{item.snippet}</p>
                  </div>

                  {/* Primary Action Controls */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {primarySafeLink ? (
                      <>
                        <button
                          type="button"
                          onClick={() => executeSingleHarvestedItem(item)}
                          disabled={exec?.running || exec?.verified}
                          className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                            exec?.verified
                              ? 'glass-subtle text-emerald-300 border-emerald-400/30'
                              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                          }`}
                        >
                          {exec?.verified ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Confirmed</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5" />
                              <span>
                                {exec?.running ? 'Confirming...' : 'Complete in Headless Browser'}
                              </span>
                            </>
                          )}
                        </button>

                        <a
                          href={primarySafeLink.sanitizedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2 rounded-xl glass-subtle hover:border-white/20 text-slate-300 hover:text-white text-xs inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                        >
                          <span>Open Link</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>

                        <button
                          type="button"
                          onClick={async () => {
                            await copyTextToClipboard(primarySafeLink.sanitizedUrl);
                            setCopiedId(item.id);
                            setTimeout(() => setCopiedId(null), 1800);
                          }}
                          className="p-2 rounded-xl glass-subtle hover:border-white/20 text-slate-300 hover:text-white cursor-pointer"
                          title="Copy sanitized verification link"
                        >
                          {copiedId === item.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </>
                    ) : (
                      item.broker && (
                        <button
                          type="button"
                          onClick={() => handleApplyReplyOutcome(item)}
                          className="px-3.5 py-2 rounded-xl glass-subtle hover:border-emerald-400/40 text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <span>{item.recommendedActionLabel}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Sanitized URL & Execution Receipt Footer */}
                {(primarySafeLink || exec?.done) && (
                  <div className="pt-2.5 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-400 font-mono">
                    {primarySafeLink && (
                      <span className="truncate max-w-2xl">
                        Verified HTTPS Host ({primarySafeLink.host}): {primarySafeLink.sanitizedUrl}
                      </span>
                    )}
                    {exec?.done && (
                      <span className={exec.verified ? 'text-emerald-300' : 'text-amber-300'}>
                        {exec.summary}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
