import React, { useState, useMemo, useEffect } from 'react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import {
  EMAIL_PROVIDER_PRESETS,
  EmailProviderId,
  buildWebmailComposeUrls,
  detectProviderFromEmail,
  inferCustomSmtpDefaults,
} from '../utils/emailProviderConfig';
import {
  useEmailConnection,
  verifyAndConnectSmtpAccount,
  connectGoogleOAuthAccount,
  connectWebmailSenderAccount,
  disconnectSmtpAccount,
  disconnectGoogleOAuthAccount,
  disconnectWebmailSenderAccount,
  findBrokerById,
  hasVerifiedEmailReceipt,
  buildStatutoryNoticeForBroker,
  sendEmailViaConnectedAccount,
} from '../services/emailConnectionStore';
import {
  RecipientDeliverabilityVerification,
  isValidEmailSyntax,
  markBrokerEmailBounced,
  resetBrokerContactOverride,
  resolveBrokerContactProfile,
  setBrokerCustomEmail,
  useBrokerContactOverrides,
  verifyRecipientDeliverabilityClient,
} from '../utils/brokerContactResolver';
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
  EyeOff,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Edit3,
  RotateCcw,
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
  brokerId: string;
  brokerName: string;
  optOutUrl: string;
  recipientEmail: string;
  ccDelivered: string[];
  usedFallback: boolean;
  requiresPortalFollowup: boolean;
  status: 'sent' | 'failed' | 'portal_redirect';
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
    webmailSender,
    backendAvailable,
    isDirectSendConnected,
    isWebmailConnected,
    activeConnectedEmail,
  } = useEmailConnection();
  const contactOverrides = useBrokerContactOverrides();

  // Inline email connect state when user opens modal before connecting
  const initialEmail =
    activeConnectedEmail || profile.emails.find((e) => Boolean(e && e.trim())) || '';
  const [emailInput, setEmailInput] = useState<string>(initialEmail);
  const [provider, setProvider] = useState<EmailProviderId>(() =>
    detectProviderFromEmail(initialEmail)
  );
  const [appPassword, setAppPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [customHost, setCustomHost] = useState<string>('');
  const [customPort, setCustomPort] = useState<number>(587);
  const [customSecure, setCustomSecure] = useState<boolean>(false);
  const [rememberInBrowser, setRememberInBrowser] = useState<boolean>(true);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Queue & deliverability mitigation options
  const [includeAlreadySent, setIncludeAlreadySent] = useState<boolean>(false);
  const [bccSelf, setBccSelf] = useState<boolean>(false);
  const [ccBackupDpo, setCcBackupDpo] = useState<boolean>(true);
  const [skipPortalPrimary, setSkipPortalPrimary] = useState<boolean>(false);
  const [showSamplePreview, setShowSamplePreview] = useState<boolean>(queue.length === 1);

  // Per-broker inline address override & live MX pre-flight map
  const [editingBrokerId, setEditingBrokerId] = useState<string | null>(null);
  const [draftCustomEmail, setDraftCustomEmail] = useState<string>('');
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [isCheckingMx, setIsCheckingMx] = useState<boolean>(false);
  const [mxResultsByBroker, setMxResultsByBroker] = useState<
    Record<string, RecipientDeliverabilityVerification>
  >({});
  const [mxSummaryBanner, setMxSummaryBanner] = useState<string | null>(null);

  // Resolved broker targets with contact mitigation profile
  const allTargets = useMemo(() => {
    return queue
      .map((result) => {
        const broker = findBrokerById(result.brokerId);
        if (!broker) return null;
        const contact = resolveBrokerContactProfile(broker, contactOverrides);
        return contact.effectivePrimaryEmail ? { broker, result, contact } : null;
      })
      .filter(
        (
          item
        ): item is {
          broker: DataBroker;
          result: ScanResult;
          contact: ReturnType<typeof resolveBrokerContactProfile>;
        } => item !== null
      );
  }, [queue, contactOverrides]);

  const unsentTargets = useMemo(
    () => allTargets.filter(({ result }) => !hasVerifiedEmailReceipt(result)),
    [allTargets]
  );

  const candidateTargets = useMemo(() => {
    if (includeAlreadySent || unsentTargets.length === 0) {
      return allTargets;
    }
    return unsentTargets;
  }, [allTargets, unsentTargets, includeAlreadySent]);

  const portalOnlyTargets = useMemo(() => {
    return candidateTargets.filter(({ broker, contact }) => {
      const mx = mxResultsByBroker[broker.id];
      if (mx && !mx.valid) return true;
      if (skipPortalPrimary && contact.requiresPortalWarning && !contact.hasCustomOverride) {
        return true;
      }
      return false;
    });
  }, [candidateTargets, mxResultsByBroker, skipPortalPrimary]);

  const activeTargets = useMemo(() => {
    const portalOnlyIds = new Set(portalOnlyTargets.map((t) => t.broker.id));
    return candidateTargets.filter((t) => !portalOnlyIds.has(t.broker.id));
  }, [candidateTargets, portalOnlyTargets]);

  const portalPrimaryCount = useMemo(
    () =>
      candidateTargets.filter(
        ({ contact }) => contact.requiresPortalWarning && !contact.hasCustomOverride
      ).length,
    [candidateTargets]
  );

  // Editable notice when sending to a single broker
  const firstNotice = useMemo(() => {
    const first = activeTargets[0] || candidateTargets[0];
    if (!first) return { subject: '', body: '' };
    return buildStatutoryNoticeForBroker(
      first.broker,
      profile,
      activeConnectedEmail || emailInput || undefined
    );
  }, [activeTargets, candidateTargets, profile, activeConnectedEmail, emailInput]);

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
      const detected = detectProviderFromEmail(val);
      setProvider(detected);
      if (detected === 'custom') {
        const inferred = inferCustomSmtpDefaults(val);
        if (inferred) {
          setCustomHost(inferred.host);
          setCustomPort(inferred.port);
          setCustomSecure(inferred.secure);
        }
      }
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
      await connectGoogleOAuthAccount({
        loginHint: emailInput.endsWith('@gmail.com') ? emailInput : undefined,
        rememberInBrowser,
      });
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Google OAuth authorization failed.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleInlineWebmailSignIn = () => {
    setConnectError(null);
    try {
      connectWebmailSenderAccount({
        userEmail: emailInput,
        senderName: `${profile.firstName} ${profile.lastName}`.trim() || undefined,
        rememberInBrowser,
      });
    } catch (err) {
      setConnectError(
        err instanceof Error ? err.message : 'Enter your email address above first.'
      );
    }
  };

  const handleDisconnectCurrent = async () => {
    if (smtp?.verified) {
      await disconnectSmtpAccount();
    }
    if (oauthUser) {
      await disconnectGoogleOAuthAccount();
    }
    if (webmailSender) {
      disconnectWebmailSenderAccount();
    }
  };

  const handleVerifyAllMxDeliverability = async () => {
    if (candidateTargets.length === 0) return;
    setIsCheckingMx(true);
    setMxSummaryBanner(null);
    setDispatchError(null);

    const nextMap: Record<string, RecipientDeliverabilityVerification> = {
      ...mxResultsByBroker,
    };
    let verifiedCount = 0;
    let reroutedCount = 0;
    let portalFallbackCount = 0;

    for (const { broker, contact } of candidateTargets) {
      try {
        const res = await verifyRecipientDeliverabilityClient(
          contact.effectivePrimaryEmail,
          contact.fallbackEmails
        );
        nextMap[broker.id] = res;

        if (res.valid && res.recommendedEmail) {
          verifiedCount++;
          if (res.usedFallback) {
            reroutedCount++;
            markBrokerEmailBounced(broker.id, contact.effectivePrimaryEmail);
          }
        } else {
          portalFallbackCount++;
        }
      } catch {
        // Keep existing target if offline/network interrupted
      }
    }

    setMxResultsByBroker(nextMap);
    setIsCheckingMx(false);

    const parts: string[] = [`${verifiedCount} mail server(s) verified via live DNS MX`];
    if (reroutedCount > 0) {
      parts.push(`${reroutedCount} dead address(es) auto-rerouted to backup DPO`);
    }
    if (portalFallbackCount > 0) {
      parts.push(`${portalFallbackCount} unresolvable domain(s) moved to Web Portal queue to prevent bounces`);
    }
    setMxSummaryBanner(parts.join(' · '));
  };

  const handleStartEditBrokerEmail = (brokerId: string, currentEmail: string) => {
    setEditingBrokerId(brokerId);
    setDraftCustomEmail(currentEmail);
    setOverrideError(null);
  };

  const handleSaveBrokerEmailOverride = (brokerId: string) => {
    const clean = draftCustomEmail.trim().toLowerCase();
    if (!isValidEmailSyntax(clean)) {
      setOverrideError('Enter a valid email address (e.g. privacy@broker.com).');
      return;
    }
    try {
      setBrokerCustomEmail(brokerId, clean);
      setEditingBrokerId(null);
      setOverrideError(null);
      // Clear stale MX check for edited broker so it re-evaluates cleanly
      setMxResultsByBroker((prev) => {
        const next = { ...prev };
        delete next[brokerId];
        return next;
      });
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : 'Invalid email override.');
    }
  };

  const handleConfirmAndSendEmails = async () => {
    if (!isDirectSendConnected || !activeConnectedEmail) {
      setDispatchError('Connect your email account first so synOUT can send these emails for you.');
      return;
    }
    if (activeTargets.length === 0 && portalOnlyTargets.length === 0) {
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
      const { broker, contact } = activeTargets[i];
      setCurrentIndex(i + 1);
      setCurrentBrokerName(broker.name);

      const notice =
        activeTargets.length === 1
          ? { subject: singleSubject, body: singleBody }
          : buildStatutoryNoticeForBroker(broker, profile, activeConnectedEmail);

      const ccList = ccBackupDpo ? contact.recommendedCcEmails : [];

      try {
        const res = await sendEmailViaConnectedAccount({
          recipientEmail: contact.effectivePrimaryEmail,
          fallbackRecipientEmails: contact.fallbackEmails,
          ccEmails: ccList,
          subject: notice.subject,
          body: notice.body,
          senderName: senderFullName,
          brokerId: broker.id,
          brokerName: broker.name,
          brokerDomain: broker.domain,
          bccSelf,
        });

        sentCount++;
        if (res.usedFallback) {
          markBrokerEmailBounced(broker.id, contact.effectivePrimaryEmail);
        }
        onBrokerDispatched(broker.id, res.messageId, true);
        collectedReceipts.push({
          brokerId: broker.id,
          brokerName: broker.name,
          optOutUrl: broker.optOutUrl,
          recipientEmail: res.deliveredTo || contact.effectivePrimaryEmail,
          ccDelivered: res.ccDelivered || [],
          usedFallback: res.usedFallback,
          requiresPortalFollowup: contact.requiresPortalWarning,
          status: 'sent',
          detail: res.messageId,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'SMTP delivery failed';
        collectedReceipts.push({
          brokerId: broker.id,
          brokerName: broker.name,
          optOutUrl: broker.optOutUrl,
          recipientEmail: contact.effectivePrimaryEmail,
          ccDelivered: [],
          usedFallback: false,
          requiresPortalFollowup: true,
          status: 'failed',
          detail: errMsg,
        });
      }
      setReceipts([...collectedReceipts]);
    }

    // Append any portal-redirected brokers so user has 1-click portal links in the summary
    for (const { broker, contact } of portalOnlyTargets) {
      const mx = mxResultsByBroker[broker.id];
      collectedReceipts.push({
        brokerId: broker.id,
        brokerName: broker.name,
        optOutUrl: broker.optOutUrl,
        recipientEmail: contact.effectivePrimaryEmail,
        ccDelivered: [],
        usedFallback: false,
        requiresPortalFollowup: true,
        status: 'portal_redirect',
        detail:
          mx && !mx.valid
            ? 'Blocked dead MX domain from bouncing — complete via official web portal'
            : 'Skipped email per Web-Portal-Primary preference — open portal',
      });
    }
    setReceipts([...collectedReceipts]);

    setIsSending(false);
    setDispatchFinished(true);

    if (sentCount === 0 && activeTargets.length > 0 && collectedReceipts.length > 0) {
      setDispatchError(collectedReceipts[0].detail);
    }
  };

  const sentReceiptsCount = receipts.filter((r) => r.status === 'sent').length;
  const failedReceiptsCount = receipts.filter((r) => r.status === 'failed').length;
  const portalRedirectCount = receipts.filter((r) => r.status === 'portal_redirect').length;
  const preset = EMAIL_PROVIDER_PRESETS[provider];
  const isSingleMode = candidateTargets.length === 1;

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
                ? 'Email Opt-Out Transmission & Deliverability Report'
                : isSingleMode
                ? `Send Statutory Opt-Out Email to ${candidateTargets[0]?.broker.name}`
                : `Send ${activeTargets.length} Verified Opt-Out Emails From Your Email`}
            </h2>
            <p className="text-xs text-slate-400">
              {dispatchFinished
                ? `Completed outbound transmission via ${activeConnectedEmail} with live DNS MX bounce protection.`
                : 'synOUT pre-verifies recipient DNS MX servers, routes subsidiary brokers to parent-entity DPO desks, and lets you override any compliance email before sending.'}
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
                      Sending From:{' '}
                      <span className="text-emerald-400 font-mono">{activeConnectedEmail}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {smtp?.verified
                        ? `Connected via ${smtp.resolvedHost}:${smtp.resolvedPort} · Pre-send DNS MX failover active`
                        : 'Connected via Google Gmail API · Pre-send DNS MX failover active'}
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
            ) : isWebmailConnected && activeConnectedEmail && webmailSender ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 px-4 bg-slate-950 border border-sky-500/35 rounded-xl">
                <div className="flex items-center gap-3 min-w-0">
                  <CheckCircle2 className="w-5 h-5 text-sky-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      Signed In via Webmail:{' '}
                      <span className="text-sky-400 font-mono">{activeConnectedEmail}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Launches pre-addressed notices in {webmailSender.preferredLauncher.toUpperCase()} (no password or server socket required)
                    </div>
                  </div>
                </div>

                {!isSending && (
                  <button
                    type="button"
                    onClick={handleDisconnectCurrent}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Switch Login Method
                  </button>
                )}
              </div>
            ) : (
              <div className="p-4 sm:p-5 bg-slate-950 border border-amber-500/30 rounded-xl space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-amber-300 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Connect Your Email Once to Dispatch {activeTargets.length} Demand(s)</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {backendAvailable === false
                        ? 'Static hosting detected — sign in with Instant Webmail Login or Google OAuth (HTTPS) below.'
                        : 'Sign in with an App Password for automated background sending, Google OAuth, or Instant Webmail Login (zero password).'}
                    </p>
                  </div>
                  {onOpenEmailWorkspace && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenEmailWorkspace();
                      }}
                      className="text-[11px] text-emerald-400 hover:underline cursor-pointer whitespace-nowrap"
                    >
                      Full OAuth &amp; Email Settings
                    </button>
                  )}
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
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          autoComplete="off"
                          value={appPassword}
                          onChange={(e) => setAppPassword(e.target.value)}
                          placeholder={
                            provider === 'icloud' ? 'xxxx-xxxx-xxxx-xxxx' : 'xxxx xxxx xxxx xxxx'
                          }
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-3 pr-8 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                        >
                          {showPassword ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
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
                      <button
                        type="button"
                        onClick={handleInlineWebmailSignIn}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/30 text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        Instant Webmail Login (No Password)
                      </button>
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
                      {backendAvailable !== false && (
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
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400">{preset.helpText}</p>
                </form>

                {connectError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>{connectError}</span>
                    </div>
                    {emailInput.includes('@') && (
                      <button
                        type="button"
                        onClick={handleInlineWebmailSignIn}
                        className="px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold cursor-pointer shrink-0 whitespace-nowrap"
                      >
                        Use Webmail Login Instead
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Recipient List, MX Pre-Flight & Contact Override Controls (Pre-Send) */}
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

            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-300 tabular-nums">
                  Recipient Broker Privacy Desks ({activeTargets.length} email
                  {portalOnlyTargets.length > 0 ? ` · ${portalOnlyTargets.length} portal` : ''}):
                </span>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleVerifyAllMxDeliverability}
                    disabled={isCheckingMx || candidateTargets.length === 0}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-300 font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    {isCheckingMx ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isCheckingMx ? 'Checking DNS MX...' : 'Verify Deliverability & Auto-Fix'}
                    </span>
                  </button>

                  {!isSingleMode && (
                    <button
                      type="button"
                      onClick={() => setShowSamplePreview((v) => !v)}
                      className="text-slate-300 hover:text-white inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{showSamplePreview ? 'Hide Preview' : 'Preview Notice'}</span>
                      {showSamplePreview ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {mxSummaryBanner && (
                <div className="p-2.5 px-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2 tabular-nums">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{mxSummaryBanner}</span>
                </div>
              )}

              <div className="max-h-56 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl divide-y divide-slate-800/80">
                {candidateTargets.map(({ broker, contact }) => {
                  const mx = mxResultsByBroker[broker.id];
                  const isEditing = editingBrokerId === broker.id;
                  const isSkippedToPortal = portalOnlyTargets.some((p) => p.broker.id === broker.id);

                  return (
                    <div key={broker.id} className="px-3.5 py-2.5 space-y-2 text-xs">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-white truncate">{broker.name}</span>
                            <span aria-hidden="true" className="text-slate-600">
                              ·
                            </span>
                            <span
                              className={`text-[11px] ${
                                mx && !mx.valid
                                  ? 'text-rose-400'
                                  : contact.hasCustomOverride || contact.reroutedFromBounced
                                  ? 'text-sky-400'
                                  : contact.requiresPortalWarning
                                  ? 'text-amber-300'
                                  : 'text-slate-400'
                              }`}
                            >
                              {mx && !mx.valid
                                ? 'No MX Server — Use Web Portal'
                                : mx?.mxVerified
                                ? `MX Verified (${mx.mxHosts[0] || broker.domain})`
                                : contact.deliverabilityLabel}
                            </span>
                          </div>

                          <div className="text-[11px] font-mono flex flex-wrap items-center gap-1.5">
                            <span
                              className={
                                isSkippedToPortal
                                  ? 'text-slate-500 line-through'
                                  : 'text-emerald-400'
                              }
                            >
                              {contact.effectivePrimaryEmail}
                            </span>
                            {ccBackupDpo &&
                              !isSkippedToPortal &&
                              contact.recommendedCcEmails.length > 0 && (
                                <span className="text-slate-500">
                                  + CC {contact.recommendedCcEmails[0]}
                                </span>
                              )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {contact.requiresPortalWarning && (
                            <a
                              href={broker.optOutUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-amber-300 inline-flex items-center gap-1 whitespace-nowrap text-[11px]"
                              title="Open broker official opt-out portal"
                            >
                              <span>Portal</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              isEditing
                                ? setEditingBrokerId(null)
                                : handleStartEditBrokerEmail(
                                    broker.id,
                                    contact.effectivePrimaryEmail
                                  )
                            }
                            className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white inline-flex items-center gap-1 cursor-pointer whitespace-nowrap text-[11px]"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>{isEditing ? 'Close' : 'Edit'}</span>
                          </button>
                        </div>
                      </div>

                      {isEditing && (
                        <div className="pt-2 border-t border-slate-800/80 space-y-2">
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <input
                              type="email"
                              value={draftCustomEmail}
                              onChange={(e) => setDraftCustomEmail(e.target.value)}
                              placeholder="Enter verified DPO email (e.g. privacy@domain.com)"
                              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                            />
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleSaveBrokerEmailOverride(broker.id)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold cursor-pointer whitespace-nowrap"
                              >
                                Save Address
                              </button>
                              {(contact.hasCustomOverride || contact.bouncedEmails.length > 0) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    resetBrokerContactOverride(broker.id);
                                    setEditingBrokerId(null);
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                  title="Restore default catalog address"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Reset</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {contact.allValidCandidates.length > 1 && (
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                              <span className="text-slate-400">Known compliance aliases:</span>
                              {contact.allValidCandidates.map((alias) => (
                                <button
                                  key={alias}
                                  type="button"
                                  onClick={() => {
                                    setBrokerCustomEmail(broker.id, alias);
                                    setEditingBrokerId(null);
                                  }}
                                  className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 font-mono text-emerald-300 cursor-pointer"
                                >
                                  {alias}
                                </button>
                              ))}
                            </div>
                          )}

                          {overrideError && (
                            <div className="text-[11px] text-rose-400">{overrideError}</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {showSamplePreview && candidateTargets.length > 0 && (
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

            {/* Multi-Address Redundancy & Portal Routing Options */}
            <div className="space-y-2 pt-1">
              <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ccBackupDpo}
                  onChange={(e) => setCcBackupDpo(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 bg-slate-950 text-emerald-500"
                />
                <span>
                  CC verified backup / parent-entity DPO address when available{' '}
                  <span className="text-slate-500">
                    (ensures delivery even if a subsidiary brand inbox is unmonitored)
                  </span>
                </span>
              </label>

              {portalPrimaryCount > 0 && (
                <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipPortalPrimary}
                    onChange={(e) => setSkipPortalPrimary(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 bg-slate-950 text-emerald-500"
                  />
                  <span>
                    Skip {portalPrimaryCount} Web-Portal-Primary directory inbox(es) and list their
                    direct opt-out portals instead{' '}
                    <span className="text-slate-500">
                      (prevents auto-bounces from free directories that enforce CAPTCHA portals)
                    </span>
                  </span>
                </label>
              )}

              {isDirectSendConnected && smtp?.verified && (
                <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bccSelf}
                    onChange={(e) => setBccSelf(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 bg-slate-950 text-emerald-500"
                  />
                  <span>
                    BCC a copy of each sent demand to{' '}
                    <strong className="font-mono text-white">{activeConnectedEmail}</strong>
                  </span>
                </label>
              )}
            </div>
          </div>
        )}

        {/* Live Transmission Progress */}
        {isSending && (
          <div className="p-5 bg-slate-950 border border-emerald-500/30 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs tabular-nums">
              <span className="text-white font-semibold flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                <span>Verifying MX &amp; sending to {currentBrokerName}...</span>
              </span>
              <span className="text-emerald-400 font-mono font-bold">
                {currentIndex} / {activeTargets.length}
              </span>
            </div>

            <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
              <div
                className="bg-emerald-500 h-full transition-transform duration-150 origin-left"
                style={{
                  transform: `scaleX(${Math.max(
                    0.04,
                    currentIndex / Math.max(1, activeTargets.length)
                  )})`,
                }}
              />
            </div>

            <p className="text-[11px] text-slate-400">
              Transmitting over authenticated outbound TLS from{' '}
              <span className="font-mono text-slate-200">{activeConnectedEmail}</span> with
              automatic backup DPO failover...
            </p>
          </div>
        )}

        {/* Delivery Receipts Summary (Post-Send) */}
        {dispatchFinished && (
          <div className="space-y-4">
            <div
              className={`p-4 rounded-xl border text-xs flex items-start gap-3 ${
                sentReceiptsCount > 0 || portalRedirectCount > 0
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}
            >
              {sentReceiptsCount > 0 || portalRedirectCount > 0 ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-bold text-sm text-white tabular-nums">
                  {sentReceiptsCount > 0
                    ? `Sent ${sentReceiptsCount} Verified Statutory Opt-Out Email${
                        sentReceiptsCount === 1 ? '' : 's'
                      }`
                    : portalRedirectCount > 0
                    ? `${portalRedirectCount} Broker(s) Routed to Official Web Opt-Out Portals`
                    : 'Outbound Email Transmission Blocked / Failed'}
                </div>
                <p className="text-xs text-slate-300">
                  {sentReceiptsCount > 0
                    ? `Every delivered legal demand is saved in the "Sent" folder of ${activeConnectedEmail}. For any hybrid/portal-primary broker below, you can also launch its direct web opt-out form in one click.`
                    : dispatchError ||
                      'Recipient domain rejected inbound mail. Use the official opt-out portal link(s) below.'}
                </p>
                {failedReceiptsCount > 0 && (
                  <p className="text-xs text-amber-300">
                    {failedReceiptsCount} recipient(s) rejected inbound email — use their direct
                    Opt-Out Portal button below so your removal still completes.
                  </p>
                )}
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl divide-y divide-slate-800/80">
              {receipts.map((item, idx) => (
                <div
                  key={`${item.brokerId}-${idx}`}
                  className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-white truncate">{item.brokerName}</span>
                      {item.usedFallback && (
                        <span className="text-[11px] text-sky-400">
                          · Auto-routed to verified backup DPO
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono truncate">
                      {item.recipientEmail}
                      {item.ccDelivered.length > 0 && ` (+ CC ${item.ccDelivered.join(', ')})`}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.status === 'sent' ? (
                      <span className="text-emerald-400 font-mono text-[11px] truncate max-w-[180px]">
                        Sent · {item.detail}
                      </span>
                    ) : item.status === 'portal_redirect' ? (
                      <span className="text-amber-300 text-[11px]">Portal Required</span>
                    ) : (
                      <span
                        className="text-rose-400 text-[11px] truncate max-w-[170px]"
                        title={item.detail}
                      >
                        Blocked Bounce · Use Portal
                      </span>
                    )}

                    {(item.status !== 'sent' || item.requiresPortalFollowup) && item.optOutUrl && (
                      <a
                        href={item.optOutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-300 font-semibold inline-flex items-center gap-1 whitespace-nowrap text-[11px]"
                      >
                        <span>Open Portal</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
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
                {!isDirectSendConnected && isWebmailConnected && activeTargets.length > 0 ? (
                  (() => {
                    const preferred = webmailSender?.preferredLauncher || 'gmail';
                    const isBatch = activeTargets.length > 1;
                    const primaryTo = isBatch
                      ? activeConnectedEmail || activeTargets[0].contact.effectivePrimaryEmail
                      : activeTargets[0].contact.effectivePrimaryEmail;
                    const bccList = isBatch
                      ? activeTargets.slice(0, 45).map((t) => t.contact.effectivePrimaryEmail)
                      : undefined;
                    const ccList =
                      !isBatch && ccBackupDpo
                        ? activeTargets[0].contact.recommendedCcEmails
                        : undefined;
                    const urls = buildWebmailComposeUrls(primaryTo, singleSubject, singleBody, {
                      cc: ccList,
                      bcc: bccList,
                    });
                    const href =
                      preferred === 'gmail'
                        ? urls.gmailUrl
                        : preferred === 'outlook'
                        ? urls.outlookUrl
                        : preferred === 'yahoo'
                        ? urls.yahooUrl
                        : urls.mailtoUrl;

                    return (
                      <a
                        href={href}
                        target={preferred === 'mailto' ? undefined : '_blank'}
                        rel="noopener noreferrer"
                        onClick={() => {
                          const code = `WEB-${preferred.toUpperCase()}-${Date.now()
                            .toString(36)
                            .toUpperCase()}`;
                          activeTargets.slice(0, 45).forEach((t) => {
                            onBrokerDispatched(t.broker.id, code, true);
                          });
                          onComplete(
                            Math.min(45, activeTargets.length),
                            activeConnectedEmail || ''
                          );
                          onClose();
                        }}
                        className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs inline-flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>
                          {isBatch
                            ? `Open ${Math.min(45, activeTargets.length)}-Broker BCC Demand in ${preferred.toUpperCase()}`
                            : `Open Demand in ${preferred.toUpperCase()}`}
                        </span>
                      </a>
                    );
                  })()
                ) : (
                  <button
                    type="button"
                    onClick={handleConfirmAndSendEmails}
                    disabled={
                      isSending ||
                      !isDirectSendConnected ||
                      (activeTargets.length === 0 && portalOnlyTargets.length === 0)
                    }
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
                            ? activeTargets.length === 0
                              ? `Review ${portalOnlyTargets.length} Portal Opt-Out(s)`
                              : activeTargets.length === 1
                              ? `Confirm & Send Email`
                              : `Confirm & Send ${activeTargets.length} Emails`
                            : 'Connect Email Above to Send'}
                        </span>
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
