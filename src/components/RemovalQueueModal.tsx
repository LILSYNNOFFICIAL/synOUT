import React, { useState, useMemo, useEffect } from 'react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import {
  EMAIL_PROVIDER_PRESETS,
  EmailProviderId,
  detectProviderFromEmail,
} from '../utils/emailProviderConfig';
import {
  useEmailConnection,
  verifyAndConnectSmtpAccount,
  connectGoogleOAuthAccount,
  disconnectSmtpAccount,
  disconnectGoogleOAuthAccount,
  findBrokerById,
  hasVerifiedEmailReceipt,
  buildStatutoryNoticeForBroker,
  sendEmailViaConnectedAccount,
} from '../services/emailConnectionStore';
import {
  X,
  Send,
  CheckCircle2,
  RefreshCw,
  Mail,
  Lock,
  AlertTriangle,
  ExternalLink,
  Eye,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface RemovalQueueModalProps {
  queue: ScanResult[];
  profile: UserProfile;
  onClose: () => void;
  onBrokerDispatched: (brokerId: string, messageId: string, silent?: boolean) => void;
  onComplete: (sentCount: number, senderEmail: string) => void;
  onOpenEmailWorkspace?: () => void;
}

interface DeliveryReceiptItem {
  brokerName: string;
  recipientEmail: string;
  status: 'sent' | 'failed';
  detail: string;
}

export const RemovalQueueModal: React.FC<RemovalQueueModalProps> = ({
  queue,
  profile,
  onClose,
  onBrokerDispatched,
  onComplete,
  onOpenEmailWorkspace,
}) => {
  const {
    smtp,
    oauthUser,
    oauthConfigured,
    isDirectSendConnected,
    activeConnectedEmail,
  } = useEmailConnection();

  // Inline email connect state when user opens modal before connecting
  const initialEmail = profile.emails[0] || '';
  const [emailInput, setEmailInput] = useState<string>(initialEmail);
  const [provider, setProvider] = useState<EmailProviderId>(() =>
    detectProviderFromEmail(initialEmail)
  );
  const [appPassword, setAppPassword] = useState<string>('');
  const [customHost, setCustomHost] = useState<string>('');
  const [customPort, setCustomPort] = useState<number>(587);
  const [customSecure, setCustomSecure] = useState<boolean>(false);
  const [rememberInBrowser, setRememberInBrowser] = useState<boolean>(true);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Queue & preview options
  const [includeAlreadySent, setIncludeAlreadySent] = useState<boolean>(false);
  const [bccSelf, setBccSelf] = useState<boolean>(false);
  const [showSamplePreview, setShowSamplePreview] = useState<boolean>(queue.length === 1);

  // Resolved broker targets with valid privacyEmail
  const allTargets = useMemo(() => {
    return queue
      .map((result) => {
        const broker = findBrokerById(result.brokerId);
        return broker && broker.privacyEmail ? { broker, result } : null;
      })
      .filter((item): item is { broker: DataBroker; result: ScanResult } => item !== null);
  }, [queue]);

  const unsentTargets = useMemo(
    () => allTargets.filter(({ result }) => !hasVerifiedEmailReceipt(result)),
    [allTargets]
  );

  const activeTargets = useMemo(() => {
    if (includeAlreadySent || unsentTargets.length === 0) {
      return allTargets;
    }
    return unsentTargets;
  }, [allTargets, unsentTargets, includeAlreadySent]);

  // Editable notice when sending to a single broker
  const firstNotice = useMemo(() => {
    if (activeTargets.length === 0) return { subject: '', body: '' };
    return buildStatutoryNoticeForBroker(
      activeTargets[0].broker,
      profile,
      activeConnectedEmail || emailInput || undefined
    );
  }, [activeTargets, profile, activeConnectedEmail, emailInput]);

  const [singleSubject, setSingleSubject] = useState<string>(firstNotice.subject);
  const [singleBody, setSingleBody] = useState<string>(firstNotice.body);

  useEffect(() => {
    setSingleSubject(firstNotice.subject);
    setSingleBody(firstNotice.body);
  }, [firstNotice.subject, firstNotice.body]);

  // Real sending progress & receipt summary
  const [isSending, setIsSending] = useState<boolean>(false);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [currentBrokerName, setCurrentBrokerName] = useState<string>('');
  const [receipts, setReceipts] = useState<DeliveryReceiptItem[]>([]);
  const [dispatchFinished, setDispatchFinished] = useState<boolean>(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const handleEmailChange = (val: string) => {
    setEmailInput(val);
    if (val.includes('@')) {
      setProvider(detectProviderFromEmail(val));
    }
  };

  const handleInlineConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    setConnectError(null);
    try {
      await verifyAndConnectSmtpAccount({
        provider,
        userEmail: emailInput,
        appPassword,
        customHost,
        customPort,
        customSecure,
        rememberInBrowser,
      });
      setAppPassword('');
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Failed to verify email connection.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleInlineGoogleOAuth = async () => {
    setIsVerifying(true);
    setConnectError(null);
    try {
      await connectGoogleOAuthAccount();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Google OAuth authorization failed.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDisconnectCurrent = async () => {
    if (smtp?.verified) {
      await disconnectSmtpAccount();
    }
    if (oauthUser) {
      await disconnectGoogleOAuthAccount();
    }
  };

  const handleConfirmAndSendEmails = async () => {
    if (!isDirectSendConnected || !activeConnectedEmail) {
      setDispatchError('Connect your email account first so synOUT can send these emails for you.');
      return;
    }
    if (activeTargets.length === 0) {
      setDispatchError('No broker privacy email addresses are queued.');
      return;
    }

    setIsSending(true);
    setDispatchError(null);
    setReceipts([]);
    let sentCount = 0;
    const collectedReceipts: DeliveryReceiptItem[] = [];
    const senderFullName = `${profile.firstName} ${profile.lastName}`.trim() || 'Authorized Consumer';

    for (let i = 0; i < activeTargets.length; i++) {
      const { broker } = activeTargets[i];
      setCurrentIndex(i + 1);
      setCurrentBrokerName(broker.name);

      const notice =
        activeTargets.length === 1
          ? { subject: singleSubject, body: singleBody }
          : buildStatutoryNoticeForBroker(broker, profile, activeConnectedEmail);

      try {
        const res = await sendEmailViaConnectedAccount({
          recipientEmail: broker.privacyEmail,
          subject: notice.subject,
          body: notice.body,
          senderName: senderFullName,
          brokerId: broker.id,
          brokerName: broker.name,
          brokerDomain: broker.domain,
          bccSelf,
        });

        sentCount++;
        onBrokerDispatched(broker.id, res.messageId, true);
        collectedReceipts.push({
          brokerName: broker.name,
          recipientEmail: broker.privacyEmail,
          status: 'sent',
          detail: res.messageId,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'SMTP delivery failed';
        collectedReceipts.push({
          brokerName: broker.name,
          recipientEmail: broker.privacyEmail,
          status: 'failed',
          detail: errMsg,
        });
      }
      setReceipts([...collectedReceipts]);
    }

    setIsSending(false);
    setDispatchFinished(true);

    if (sentCount === 0 && collectedReceipts.length > 0) {
      setDispatchError(collectedReceipts[0].detail);
    }
  };

  const sentReceiptsCount = receipts.filter((r) => r.status === 'sent').length;
  const failedReceiptsCount = receipts.filter((r) => r.status === 'failed').length;
  const preset = EMAIL_PROVIDER_PRESETS[provider];
  const isSingleMode = activeTargets.length === 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="opt-out-dispatch-modal-title"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="space-y-1">
            <h2 id="opt-out-dispatch-modal-title" className="text-xl font-bold text-white">
              {dispatchFinished
                ? 'Email Opt-Out Transmission Report'
                : isSingleMode
                ? `Send Statutory Opt-Out Email to ${activeTargets[0]?.broker.name}`
                : `Send All ${activeTargets.length} Opt-Out Emails From Your Email`}
            </h2>
            <p className="text-xs text-slate-400">
              {dispatchFinished
                ? `Completed outbound transmission via ${activeConnectedEmail}.`
                : 'synOUT sends real CCPA, CPRA, and GDPR deletion demands directly from your connected email address on your behalf.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Connected Account Banner OR Inline Connect Form */}
        {!dispatchFinished && (
          <>
            {isDirectSendConnected && activeConnectedEmail ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 px-4 bg-slate-950 border border-emerald-500/30 rounded-xl">
                <div className="flex items-center gap-3 min-w-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      Sending From: <span className="text-emerald-400 font-mono">{activeConnectedEmail}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {smtp?.verified
                        ? `Connected via ${smtp.resolvedHost}:${smtp.resolvedPort} · Stays connected across tabs`
                        : 'Connected via Google Gmail API'}
                    </div>
                  </div>
                </div>

                {!isSending && (
                  <button
                    type="button"
                    onClick={handleDisconnectCurrent}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Switch Email
                  </button>
                )}
              </div>
            ) : (
              <div className="p-4 sm:p-5 bg-slate-950 border border-amber-500/30 rounded-xl space-y-4">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-amber-300 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Connect Your Email Once to Send All {activeTargets.length} Demands</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Connect your Gmail, Outlook, Yahoo, iCloud, Proton, or custom email below. Your
                    connection stays active across all tabs so synOUT can send every opt-out email
                    directly from your address.
                  </p>
                </div>

                <form onSubmit={handleInlineConnect} className="space-y-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(Object.keys(EMAIL_PROVIDER_PRESETS) as EmailProviderId[]).map((pid) => (
                      <button
                        key={pid}
                        type="button"
                        onClick={() => setProvider(pid)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                          provider === pid
                            ? 'bg-slate-800 text-white border-emerald-500/50'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {EMAIL_PROVIDER_PRESETS[pid].shortLabel}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-300">
                        Your Email Address
                      </label>
                      <input
                        type="email"
                        required
                        value={emailInput}
                        onChange={(e) => handleEmailChange(e.target.value)}
                        placeholder="you@gmail.com"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <label className="block text-xs font-semibold text-slate-300">
                          {preset.credentialLabel}
                        </label>
                        {preset.appPasswordUrl && (
                          <a
                            href={preset.appPasswordUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-emerald-400 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <span>Get App Password</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <input
                        type="password"
                        required
                        autoComplete="off"
                        value={appPassword}
                        onChange={(e) => setAppPassword(e.target.value)}
                        placeholder="xxxx xxxx xxxx xxxx"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                      />
                    </div>
                  </div>

                  {provider === 'custom' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        required
                        value={customHost}
                        onChange={(e) => setCustomHost(e.target.value)}
                        placeholder="smtp.yourdomain.com"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                      />
                      <select
                        value={customPort}
                        onChange={(e) => {
                          const p = Number(e.target.value);
                          setCustomPort(p);
                          setCustomSecure(p === 465);
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500/60"
                      >
                        <option value={587}>Port 587 (STARTTLS)</option>
                        <option value={465}>Port 465 (SSL/TLS)</option>
                        <option value={2525}>Port 2525</option>
                      </select>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberInBrowser}
                        onChange={(e) => setRememberInBrowser(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                      />
                      <span>Keep my email connected on this browser</span>
                    </label>

                    <div className="flex flex-wrap items-center gap-2">
                      {oauthConfigured && (
                        <button
                          type="button"
                          onClick={handleInlineGoogleOAuth}
                          disabled={isVerifying}
                          className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-xs font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          Google OAuth
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={isVerifying}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        {isVerifying ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Verifying...</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-3.5 h-3.5" />
                            <span>Connect &amp; Verify Email</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400">{preset.helpText}</p>
                </form>

                {connectError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{connectError}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Recipient List & Notice Preview (Pre-Send) */}
        {!dispatchFinished && !isSending && (
          <div className="space-y-4">
            {unsentTargets.length > 0 && unsentTargets.length < allTargets.length && (
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAlreadySent}
                  onChange={(e) => setIncludeAlreadySent(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-emerald-500"
                />
                <span>
                  Also re-send to {allTargets.length - unsentTargets.length} broker(s) that already received a verified email
                </span>
              </label>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 tabular-nums">
                  Recipient Broker Privacy Desks ({activeTargets.length}):
                </span>
                {!isSingleMode && (
                  <button
                    type="button"
                    onClick={() => setShowSamplePreview((v) => !v)}
                    className="text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{showSamplePreview ? 'Hide Email Preview' : 'Preview Statutory Email'}</span>
                    {showSamplePreview ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>

              <div className="max-h-40 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl divide-y divide-slate-800/80">
                {activeTargets.map(({ broker }) => (
                  <div
                    key={broker.id}
                    className="px-3.5 py-2 flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="font-medium text-white truncate">{broker.name}</span>
                    <span className="text-emerald-400 font-mono truncate">{broker.privacyEmail}</span>
                  </div>
                ))}
              </div>
            </div>

            {showSamplePreview && activeTargets.length > 0 && (
              <div className="space-y-2 pt-1">
                <input
                  type="text"
                  value={singleSubject}
                  onChange={(e) => setSingleSubject(e.target.value)}
                  readOnly={!isSingleMode}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500/50"
                />
                <textarea
                  rows={6}
                  value={singleBody}
                  onChange={(e) => setSingleBody(e.target.value)}
                  readOnly={!isSingleMode}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 font-mono leading-relaxed focus:outline-none focus:border-emerald-500/50 resize-y"
                />
              </div>
            )}

            {isDirectSendConnected && smtp?.verified && (
              <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={bccSelf}
                  onChange={(e) => setBccSelf(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 bg-slate-950 text-emerald-500"
                />
                <span>
                  BCC a copy of each sent demand to <strong className="font-mono text-white">{activeConnectedEmail}</strong>{' '}
                  <span className="text-slate-500">(every sent email is also saved automatically in your Sent folder)</span>
                </span>
              </label>
            )}
          </div>
        )}

        {/* Live Transmission Progress */}
        {isSending && (
          <div className="p-5 bg-slate-950 border border-emerald-500/30 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs tabular-nums">
              <span className="text-white font-semibold flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                <span>Sending real email to {currentBrokerName}...</span>
              </span>
              <span className="text-emerald-400 font-mono font-bold">
                {currentIndex} / {activeTargets.length}
              </span>
            </div>

            <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
              <div
                className="bg-emerald-500 h-full transition-transform duration-150 origin-left"
                style={{
                  transform: `scaleX(${Math.max(0.04, currentIndex / Math.max(1, activeTargets.length))})`,
                }}
              />
            </div>

            <p className="text-[11px] text-slate-400">
              Transmitting over authenticated outbound TLS from <span className="font-mono text-slate-200">{activeConnectedEmail}</span>...
            </p>
          </div>
        )}

        {/* Delivery Receipts Summary (Post-Send) */}
        {dispatchFinished && (
          <div className="space-y-4">
            <div
              className={`p-4 rounded-xl border text-xs flex items-start gap-3 ${
                sentReceiptsCount > 0
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}
            >
              {sentReceiptsCount > 0 ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-bold text-sm text-white">
                  {sentReceiptsCount > 0
                    ? `Sent ${sentReceiptsCount} of ${activeTargets.length} Statutory Opt-Out Email${sentReceiptsCount === 1 ? '' : 's'}`
                    : 'Outbound Email Transmission Failed'}
                </div>
                <p className="text-xs text-slate-300">
                  {sentReceiptsCount > 0
                    ? `Check the "Sent" folder in ${activeConnectedEmail} to view every transmitted legal demand and broker Message-ID receipt.`
                    : dispatchError || 'Your mail server rejected the outbound transmission.'}
                </p>
                {failedReceiptsCount > 0 && sentReceiptsCount > 0 && (
                  <p className="text-xs text-amber-300">
                    {failedReceiptsCount} recipient(s) encountered an error (listed below).
                  </p>
                )}
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl divide-y divide-slate-800/80">
              {receipts.map((item, idx) => (
                <div
                  key={`${item.brokerName}-${idx}`}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-white truncate">{item.brokerName}</div>
                    <div className="text-[11px] text-slate-400 font-mono truncate">
                      {item.recipientEmail}
                    </div>
                  </div>
                  <div className="text-right shrink-0 max-w-[240px]">
                    {item.status === 'sent' ? (
                      <span className="text-emerald-400 font-mono text-[11px] block truncate">
                        Sent · {item.detail}
                      </span>
                    ) : (
                      <span className="text-rose-400 text-[11px] block truncate" title={item.detail}>
                        Failed · {item.detail}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {dispatchError && !dispatchFinished && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{dispatchError}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div>
            {onOpenEmailWorkspace && !dispatchFinished && !isSending && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenEmailWorkspace();
                }}
                className="text-xs text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
              >
                Open Full Email Dispatch Workspace →
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {dispatchFinished ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
                >
                  Close
                </button>
                {sentReceiptsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      onComplete(sentReceiptsCount, activeConnectedEmail || '');
                      onClose();
                    }}
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer"
                  >
                    View Sent Removals in Tracker
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSending}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAndSendEmails}
                  disabled={isSending || !isDirectSendConnected || activeTargets.length === 0}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center gap-2 cursor-pointer transition-colors"
                >
                  {isSending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Sending Emails...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>
                        {isDirectSendConnected
                          ? isSingleMode
                            ? `Confirm & Send Email`
                            : `Confirm & Send ${activeTargets.length} Emails`
                          : 'Connect Email Above to Send'}
                      </span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
