import React, { useState, useMemo, useEffect } from 'react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import { getBrokerRecordSearchUrl } from '../utils/scanEngine';
import { getExhaustiveBrokerRegistry } from '../utils/dynamicBrokerRegistry';
import {
  EMAIL_PROVIDER_PRESETS,
  EmailProviderId,
  detectProviderFromEmail,
  buildWebmailComposeUrls,
} from '../utils/emailProviderConfig';
import { getAccessToken } from '../services/googleAuth';
import {
  searchBrokerVerificationEmails,
  GmailMessageSummary,
} from '../services/gmailApi';
import {
  useEmailConnection,
  setEmailConnectionMode,
  verifyAndConnectSmtpAccount,
  disconnectSmtpAccount,
  connectGoogleOAuthAccount,
  disconnectGoogleOAuthAccount,
  findBrokerById,
  hasVerifiedEmailReceipt,
  buildStatutoryNoticeForBroker,
  sendEmailViaConnectedAccount,
} from '../services/emailConnectionStore';
import { copyTextToClipboard } from '../utils/exportEngines';
import {
  Mail,
  Send,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  Search,
  RefreshCw,
  AlertTriangle,
  FileText,
  Inbox,
  Link2,
  ChevronRight,
  Lock,
  X,
  Layers,
} from 'lucide-react';

interface GmailDispatchCenterProps {
  results: ScanResult[];
  profile: UserProfile;
  onMarkDispatched: (brokerId: string, messageId: string, silent?: boolean) => void;
  onOpenPowerOfAttorney: () => void;
  onStartScan?: () => void;
}

interface PendingSendConfirmation {
  type: 'single' | 'batch';
  targets: { broker: DataBroker; subject: string; body: string }[];
}

export const GmailDispatchCenter: React.FC<GmailDispatchCenterProps> = ({
  results,
  profile,
  onMarkDispatched,
  onOpenPowerOfAttorney,
  onStartScan,
}) => {
  const {
    mode: connectionMode,
    smtp: smtpConnection,
    oauthUser,
    oauthAccessToken: accessToken,
    oauthConfigured,
    isDirectSendConnected: isAccountConnectedForDirectSend,
    activeConnectedEmail,
  } = useEmailConnection();

  // Form inputs for Direct Email / App Password connection
  const initialEmail = smtpConnection?.userEmail || profile.emails[0] || '';
  const [smtpEmail, setSmtpEmail] = useState<string>(initialEmail);
  const [smtpProvider, setSmtpProvider] = useState<EmailProviderId>(() =>
    smtpConnection?.provider || detectProviderFromEmail(initialEmail)
  );
  const [smtpAppPassword, setSmtpAppPassword] = useState<string>('');
  const [customHost, setCustomHost] = useState<string>(smtpConnection?.customHost || '');
  const [customPort, setCustomPort] = useState<number>(smtpConnection?.customPort || 587);
  const [customSecure, setCustomSecure] = useState<boolean>(smtpConnection?.customSecure || false);
  const [rememberInBrowser, setRememberInBrowser] = useState<boolean>(
    smtpConnection ? smtpConnection.rememberInBrowser : true
  );
  const [bccSelf, setBccSelf] = useState<boolean>(false);

  const [isVerifyingSmtp, setIsVerifyingSmtp] = useState<boolean>(false);
  const [smtpError, setSmtpError] = useState<string | null>(null);

  const [oauthError, setOauthError] = useState<string | null>(null);
  const [isAuthenticatingOAuth, setIsAuthenticatingOAuth] = useState<boolean>(false);

  // Queue & Letter state
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [queueFilter, setQueueFilter] = useState<'all' | 'pending' | 'submitted'>('all');
  const [customSubject, setCustomSubject] = useState<string>('');
  const [customBody, setCustomBody] = useState<string>('');
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Dispatch & Confirmation Modal state
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingSendConfirmation | null>(null);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{ sent: number; total: number; currentBroker: string } | null>(
    null
  );
  const [sendSuccessMsg, setSendSuccessMsg] = useState<string | null>(null);
  const [sendErrorMsg, setSendErrorMsg] = useState<string | null>(null);

  // Self-test verification email state
  const [confirmSelfTest, setConfirmSelfTest] = useState<boolean>(false);
  const [isSendingSelfTest, setIsSendingSelfTest] = useState<boolean>(false);
  const [selfTestReceipt, setSelfTestReceipt] = useState<string | null>(null);
  const [selfTestError, setSelfTestError] = useState<string | null>(null);

  // Gmail API Inbox Verification Scanner
  const [inboxEmails, setInboxEmails] = useState<GmailMessageSummary[]>([]);
  const [isSearchingInbox, setIsSearchingInbox] = useState<boolean>(false);
  const [inboxSearched, setInboxSearched] = useState<boolean>(false);

  const activeSenderEmail = activeConnectedEmail || smtpEmail || profile.emails[0] || '';

  const exposedBrokers = useMemo(() => {
    const exposedMap = new Map(
      results.filter((r) => r.status === 'exposed').map((r) => [r.brokerId, r])
    );
    const registry = getExhaustiveBrokerRegistry();
    return registry
      .filter((b) => exposedMap.has(b.id) && b.privacyEmail)
      .map((b) => ({
        broker: b,
        result: exposedMap.get(b.id)!,
      }));
  }, [results]);

  const pendingBrokers = useMemo(() => {
    return exposedBrokers.filter(({ result }) => !hasVerifiedEmailReceipt(result));
  }, [exposedBrokers]);

  const submittedBrokersCount = useMemo(() => {
    return exposedBrokers.filter(({ result }) => hasVerifiedEmailReceipt(result)).length;
  }, [exposedBrokers]);

  const filteredQueue = useMemo(() => {
    return exposedBrokers.filter(({ broker, result }) => {
      const matchesSearch =
        broker.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        broker.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (broker.privacyEmail || '').toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
      const verifiedSent = hasVerifiedEmailReceipt(result);
      if (queueFilter === 'pending') {
        return !verifiedSent;
      }
      if (queueFilter === 'submitted') {
        return verifiedSent;
      }
      return true;
    });
  }, [exposedBrokers, searchQuery, queueFilter]);

  useEffect(() => {
    if (!selectedBrokerId && exposedBrokers.length > 0) {
      setSelectedBrokerId(exposedBrokers[0].broker.id);
    }
  }, [exposedBrokers, selectedBrokerId]);

  const activeBroker = useMemo(
    () => (selectedBrokerId ? findBrokerById(selectedBrokerId) : undefined),
    [selectedBrokerId]
  );

  const activeResult = useMemo(
    () => results.find((r) => r.brokerId === selectedBrokerId),
    [results, selectedBrokerId]
  );

  const generatedNotice = useMemo(() => {
    if (!activeBroker) return { subject: '', body: '' };
    return buildStatutoryNoticeForBroker(activeBroker, profile, activeSenderEmail);
  }, [activeBroker, profile, activeSenderEmail]);

  useEffect(() => {
    setCustomSubject(generatedNotice.subject);
    setCustomBody(generatedNotice.body);
    setSendSuccessMsg(null);
    setSendErrorMsg(null);
  }, [generatedNotice]);

  const handleEmailInputChange = (val: string) => {
    setSmtpEmail(val);
    if (val.includes('@')) {
      setSmtpProvider(detectProviderFromEmail(val));
    }
  };

  const handleVerifySmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifyingSmtp(true);
    setSmtpError(null);

    try {
      await verifyAndConnectSmtpAccount({
        provider: smtpProvider,
        userEmail: smtpEmail,
        appPassword: smtpAppPassword,
        customHost,
        customPort,
        customSecure,
        rememberInBrowser,
      });
      setSmtpAppPassword('');
      setSmtpError(null);
    } catch (err) {
      setSmtpError(err instanceof Error ? err.message : 'Connection verification failed.');
    } finally {
      setIsVerifyingSmtp(false);
    }
  };

  const handleDisconnectSmtp = async () => {
    await disconnectSmtpAccount();
    setSmtpAppPassword('');
    setSmtpError(null);
  };

  const handleGoogleOAuthSignIn = async () => {
    setIsAuthenticatingOAuth(true);
    setOauthError(null);
    try {
      await connectGoogleOAuthAccount();
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : 'Google OAuth sign-in failed.');
    } finally {
      setIsAuthenticatingOAuth(false);
    }
  };

  const handleGoogleOAuthSignOut = async () => {
    await disconnectGoogleOAuthAccount();
  };

  const handleConfirmSendSelfTest = async () => {
    if (!activeConnectedEmail) return;
    setIsSendingSelfTest(true);
    setSelfTestError(null);
    setSelfTestReceipt(null);
    try {
      const senderName = `${profile.firstName} ${profile.lastName}`.trim() || 'synOUT User';
      const res = await sendEmailViaConnectedAccount({
        recipientEmail: activeConnectedEmail,
        subject: `synOUT Connected Email Verification Test (${activeConnectedEmail})`,
        body: `Hello ${senderName},\n\nThis message confirms that your email account (${activeConnectedEmail}) is actively connected to synOUT.\n\nWhen you click "Opt Out of All" or "Send Opt-Out Email", synOUT transmits statutory CCPA/CPRA/GDPR deletion demands directly from this email address to each data broker's privacy compliance desk on your behalf.\n\nTimestamp: ${new Date().toISOString()}`,
        senderName,
        brokerId: 'synout-self-test',
        brokerName: 'synOUT Self-Test Verification',
        brokerDomain: 'synout.local',
      });
      setSelfTestReceipt(`Delivered to ${activeConnectedEmail} · Message-ID: ${res.messageId}`);
      setConfirmSelfTest(false);
    } catch (err) {
      setSelfTestError(err instanceof Error ? err.message : 'Test email delivery failed.');
    } finally {
      setIsSendingSelfTest(false);
    }
  };

  const requestSingleSendConfirmation = () => {
    if (!activeBroker?.privacyEmail) {
      setSendErrorMsg('Selected broker does not publish a statutory opt-out email address.');
      return;
    }
    if (!isAccountConnectedForDirectSend) {
      setSendErrorMsg('Connect your email account in the panel above before sending on your behalf.');
      return;
    }

    setPendingConfirmation({
      type: 'single',
      targets: [
        {
          broker: activeBroker,
          subject: customSubject,
          body: customBody,
        },
      ],
    });
  };

  const requestBatchSendConfirmation = () => {
    if (!isAccountConnectedForDirectSend) {
      setSendErrorMsg('Connect and verify your email account above first to batch-send on your behalf.');
      return;
    }
    const targetPool = pendingBrokers.length > 0 ? pendingBrokers : exposedBrokers;
    if (targetPool.length === 0) {
      setSendErrorMsg('Run an exposure scan first to populate your broker opt-out queue.');
      return;
    }

    const targets = targetPool.map(({ broker }) => {
      const notice = buildStatutoryNoticeForBroker(broker, profile, activeSenderEmail);
      return {
        broker,
        subject: notice.subject,
        body: notice.body,
      };
    });

    setPendingConfirmation({
      type: 'batch',
      targets,
    });
  };

  const executeConfirmedSend = async () => {
    if (!pendingConfirmation) return;
    const confirmation = pendingConfirmation;
    setPendingConfirmation(null);
    setIsSending(true);
    setSendErrorMsg(null);
    setSendSuccessMsg(null);
    const senderName = `${profile.firstName} ${profile.lastName}`.trim() || 'Authorized Consumer';

    if (confirmation.type === 'single') {
      const target = confirmation.targets[0];
      try {
        const res = await sendEmailViaConnectedAccount({
          recipientEmail: target.broker.privacyEmail,
          subject: target.subject,
          body: target.body,
          senderName,
          brokerId: target.broker.id,
          brokerName: target.broker.name,
          brokerDomain: target.broker.domain,
          bccSelf,
        });
        onMarkDispatched(target.broker.id, res.messageId, false);
        setSendSuccessMsg(
          `Sent from ${res.sentFrom} to ${target.broker.privacyEmail} · Message Receipt: ${res.messageId}`
        );
      } catch (err) {
        setSendErrorMsg(err instanceof Error ? err.message : 'Failed to send email on your behalf.');
      } finally {
        setIsSending(false);
      }
      return;
    }

    // Batch send across all pending exposed brokers
    let sentCount = 0;
    const failures: string[] = [];
    const total = confirmation.targets.length;

    for (let i = 0; i < total; i++) {
      const target = confirmation.targets[i];
      setBatchProgress({
        sent: i + 1,
        total,
        currentBroker: target.broker.name,
      });

      try {
        const res = await sendEmailViaConnectedAccount({
          recipientEmail: target.broker.privacyEmail,
          subject: target.subject,
          body: target.body,
          senderName,
          brokerId: target.broker.id,
          brokerName: target.broker.name,
          brokerDomain: target.broker.domain,
          bccSelf,
        });
        sentCount++;
        onMarkDispatched(target.broker.id, res.messageId, true);
      } catch (err) {
        failures.push(
          `${target.broker.name}: ${err instanceof Error ? err.message : 'Dispatch error'}`
        );
      }
    }

    setBatchProgress(null);
    setIsSending(false);

    if (sentCount > 0 && failures.length === 0) {
      setSendSuccessMsg(
        `Sent all ${sentCount} statutory opt-out emails directly from ${activeSenderEmail}. Copies are in your Sent folder.`
      );
    } else if (sentCount > 0 && failures.length > 0) {
      setSendSuccessMsg(`Sent ${sentCount} of ${total} notices from ${activeSenderEmail}.`);
      setSendErrorMsg(`${failures.length} failed: ${failures[0]}`);
    } else {
      setSendErrorMsg(failures[0] || 'Batch email dispatch failed.');
    }
  };

  const handleCopyNotice = () => {
    void copyTextToClipboard(`${customSubject}\n\n${customBody}`);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleScanInboxForReplies = async () => {
    const token = accessToken || (await getAccessToken());
    if (!token) {
      setSendErrorMsg('Connect via Google OAuth Popup tab to scan incoming Gmail replies.');
      return;
    }

    setIsSearchingInbox(true);
    try {
      const emails = await searchBrokerVerificationEmails(token, activeBroker?.domain);
      setInboxEmails(emails);
      setInboxSearched(true);
    } catch (err) {
      setSendErrorMsg(
        err instanceof Error ? err.message : 'Failed to check Gmail inbox for broker replies.'
      );
    } finally {
      setIsSearchingInbox(false);
    }
  };

  const activePreset = EMAIL_PROVIDER_PRESETS[smtpProvider];
  const webmailLinks = useMemo(() => {
    if (!activeBroker?.privacyEmail) return null;
    return buildWebmailComposeUrls(activeBroker.privacyEmail, customSubject, customBody);
  }, [activeBroker, customSubject, customBody]);

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8">
      {/* Header & Connection Panel */}
      <section className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-2xl space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
              <span className="text-emerald-400 font-medium">Persistent Email Dispatcher</span>
              <span aria-hidden="true">·</span>
              <span>{exposedBrokers.length} Exposed Broker Inboxes</span>
              <span aria-hidden="true">·</span>
              <span>{submittedBrokersCount} Verified Sent</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight [text-wrap:balance]">
              Send Opt-Out Demands From Your Own Email
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              Connect your Gmail, Outlook, Yahoo, iCloud, Proton, or custom email once. Your
              connection stays active as you move between tabs so clicking <strong>Opt Out of All</strong>{' '}
              anywhere in synOUT sends real statutory deletion demands directly from your email on
              your behalf.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onOpenPowerOfAttorney}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <FileText className="w-4 h-4 text-emerald-400" />
              <span>Power of Attorney</span>
            </button>
          </div>
        </div>

        {/* Connection Mode Switcher */}
        <div className="pt-4 border-t border-slate-800 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setEmailConnectionMode('smtp')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  connectionMode === 'smtp'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Connect Any Email (Gmail, Outlook, Yahoo, iCloud)
              </button>
              <button
                type="button"
                onClick={() => setEmailConnectionMode('oauth')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  connectionMode === 'oauth'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Google OAuth Popup
              </button>
              <button
                type="button"
                onClick={() => setEmailConnectionMode('webmail')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  connectionMode === 'webmail'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                1-Click Webmail Compose
              </button>
            </div>

            {isAccountConnectedForDirectSend && exposedBrokers.length > 0 && (
              <button
                type="button"
                onClick={requestBatchSendConfirmation}
                disabled={isSending}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 tabular-nums"
              >
                <Layers className="w-4 h-4" />
                <span>
                  {pendingBrokers.length > 0
                    ? `Send to All ${pendingBrokers.length} Pending Brokers on My Behalf`
                    : `Re-Send to All ${exposedBrokers.length} Exposed Brokers`}
                </span>
              </button>
            )}
          </div>

          {/* Mode 1: Universal Direct SMTP */}
          {connectionMode === 'smtp' && (
            <div className="space-y-4">
              {smtpConnection?.verified ? (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3.5 px-4 bg-slate-950 border border-emerald-500/30 rounded-xl">
                    <div className="flex items-center gap-3 min-w-0">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">
                          Connected as {smtpConnection.userEmail}
                        </div>
                        <div className="text-xs text-slate-400 font-mono tabular-nums">
                          Verified outbound relay via {smtpConnection.resolvedHost}:{smtpConnection.resolvedPort} ·{' '}
                          {smtpConnection.rememberInBrowser
                            ? 'Persistent across tabs & browser reloads'
                            : 'Active for current browser tab'}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSelfTestError(null);
                          setSelfTestReceipt(null);
                          setConfirmSelfTest(true);
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-semibold text-emerald-300 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Send Test Email to Myself
                      </button>
                      <button
                        type="button"
                        onClick={handleDisconnectSmtp}
                        className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Disconnect Email
                      </button>
                    </div>
                  </div>

                  {confirmSelfTest && (
                    <div className="p-3.5 bg-slate-950 border border-emerald-500/40 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <span className="text-slate-200">
                        Send a real verification test email to your own inbox (<strong className="font-mono text-emerald-400">{smtpConnection.userEmail}</strong>) now?
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setConfirmSelfTest(false)}
                          disabled={isSendingSelfTest}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmSendSelfTest}
                          disabled={isSendingSelfTest}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {isSendingSelfTest ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          <span>{isSendingSelfTest ? 'Sending...' : 'Confirm & Send Test'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {selfTestReceipt && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="font-mono">{selfTestReceipt}</span>
                    </div>
                  )}

                  {selfTestError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{selfTestError}</span>
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleVerifySmtp} className="space-y-4">
                  {/* Provider Selector */}
                  <div className="flex flex-wrap items-center gap-2">
                    {(Object.keys(EMAIL_PROVIDER_PRESETS) as EmailProviderId[]).map((pid) => {
                      const preset = EMAIL_PROVIDER_PRESETS[pid];
                      const active = smtpProvider === pid;
                      return (
                        <button
                          key={pid}
                          type="button"
                          onClick={() => setSmtpProvider(pid)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            active
                              ? 'bg-slate-800 text-white border-emerald-500/50'
                              : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                          }`}
                        >
                          {preset.shortLabel}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    <div className="md:col-span-5 space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">
                        Your Email Address (Sender)
                      </label>
                      <input
                        type="email"
                        required
                        value={smtpEmail}
                        onChange={(e) => handleEmailInputChange(e.target.value)}
                        placeholder="you@gmail.com"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                      />
                    </div>

                    <div className="md:col-span-5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="block text-xs font-semibold text-slate-300">
                          {activePreset.credentialLabel}
                        </label>
                        {activePreset.appPasswordUrl && (
                          <a
                            href={activePreset.appPasswordUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-emerald-400 hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0"
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
                        value={smtpAppPassword}
                        onChange={(e) => setSmtpAppPassword(e.target.value)}
                        placeholder="xxxx xxxx xxxx xxxx"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500/60"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <button
                        type="submit"
                        disabled={isVerifyingSmtp}
                        className="w-full px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        {isVerifyingSmtp ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Verifying...</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-3.5 h-3.5" />
                            <span>Connect Email</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {smtpProvider === 'custom' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-300">
                          Outbound SMTP Host
                        </label>
                        <input
                          type="text"
                          required
                          value={customHost}
                          onChange={(e) => setCustomHost(e.target.value)}
                          placeholder="smtp.yourdomain.com"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500/60"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-300">
                          Submission Port
                        </label>
                        <select
                          value={customPort}
                          onChange={(e) => {
                            const port = Number(e.target.value);
                            setCustomPort(port);
                            setCustomSecure(port === 465);
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500/60"
                        >
                          <option value={587}>587 (STARTTLS)</option>
                          <option value={465}>465 (Implicit SSL/TLS)</option>
                          <option value={2525}>2525 (Alternative TLS)</option>
                        </select>
                      </div>
                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={customSecure}
                            onChange={(e) => setCustomSecure(e.target.checked)}
                            className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                          />
                          <span>Use Implicit SSL/TLS (Port 465)</span>
                        </label>
                      </div>
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
                      <span>Keep my email connected across tabs &amp; page refreshes on this browser</span>
                    </label>

                    {smtpProvider !== 'custom' && (
                      <span className="text-xs font-mono text-slate-500 tabular-nums">
                        Server: {activePreset.host}:{activePreset.port}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-400">{activePreset.helpText}</p>
                </form>
              )}

              {smtpError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{smtpError}</span>
                </div>
              )}
            </div>
          )}

          {/* Mode 2: Google Identity Services OAuth Popup */}
          {connectionMode === 'oauth' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3 px-4 bg-slate-950 border border-slate-800 rounded-xl">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-white">
                    Google Identity Services OAuth 2.0
                  </div>
                  <p className="text-xs text-slate-400">
                    {oauthConfigured
                      ? 'Authorize with Google in a popup to send opt-out demands and scan your Gmail inbox for broker verification links.'
                      : 'Optional Google OAuth Client ID is not configured in this environment. Connect your Gmail immediately in the "Connect Any Email" tab using a 16-character Google App Password.'}
                  </p>
                </div>

                {oauthUser ? (
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-xs font-semibold text-emerald-400">
                        {oauthUser.email}
                      </div>
                      <div className="text-[11px] text-slate-500">Gmail API Authorized</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleGoogleOAuthSignOut}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleGoogleOAuthSignIn}
                    disabled={isAuthenticatingOAuth}
                    className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-xs flex items-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    {isAuthenticatingOAuth ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-900" />
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                    )}
                    <span>Sign in with Google</span>
                  </button>
                )}
              </div>

              {oauthError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{oauthError}</span>
                </div>
              )}
            </div>
          )}

          {/* Mode 3: Zero-Auth 1-Click Webmail Launchers */}
          {connectionMode === 'webmail' && (
            <div className="py-3 px-4 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300">
              Launch pre-filled statutory deletion notices directly inside your signed-in Gmail,
              Outlook.com, Yahoo Mail, or desktop mail client without entering any password or
              OAuth token. Select a broker below and click your preferred mail launcher.
            </div>
          )}

          {/* Batch Progress Bar */}
          {batchProgress && (
            <div className="p-4 bg-slate-950 border border-emerald-500/30 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs tabular-nums">
                <span className="text-white font-semibold flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  <span>Sending on your behalf to {batchProgress.currentBroker}...</span>
                </span>
                <span className="text-emerald-400 font-mono">
                  {batchProgress.sent} / {batchProgress.total}
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-transform duration-150 origin-left"
                  style={{
                    transform: `scaleX(${Math.max(0.05, batchProgress.sent / Math.max(1, batchProgress.total))})`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Exposed Broker Queue */}
        <div className="lg:col-span-4 space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2 tabular-nums">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Broker Privacy Inboxes ({filteredQueue.length})</span>
              </h2>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl">
              {(['all', 'pending', 'submitted'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setQueueFilter(f)}
                  className={`flex-1 py-1.5 px-2.5 text-xs font-medium rounded-lg capitalize transition-colors cursor-pointer whitespace-nowrap ${
                    queueFilter === f
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter broker or privacy email..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {filteredQueue.map(({ broker, result }) => {
              const isSelected = broker.id === selectedBrokerId;
              const isSubmitted = hasVerifiedEmailReceipt(result);
              return (
                <button
                  key={broker.id}
                  type="button"
                  onClick={() => setSelectedBrokerId(broker.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-colors cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'bg-slate-800/90 border-emerald-500/50'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-white truncate">{broker.name}</span>
                      <span aria-hidden="true" className="text-slate-600">
                        ·
                      </span>
                      <span
                        className={
                          isSubmitted
                            ? 'text-emerald-400'
                            : broker.risk === 'Critical'
                            ? 'text-rose-400'
                            : broker.risk === 'High'
                            ? 'text-amber-400'
                            : 'text-slate-400'
                        }
                      >
                        {isSubmitted ? 'Email Sent' : `${broker.risk} Risk`}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono truncate">
                      {broker.privacyEmail}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isSubmitted ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <ChevronRight
                        className={`w-4 h-4 ${isSelected ? 'text-emerald-400' : 'text-slate-600'}`}
                      />
                    )}
                  </div>
                </button>
              );
            })}

            {exposedBrokers.length === 0 && (
              <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                <p className="text-xs text-slate-400">
                  Run an exposure audit scan first to populate your personalized broker opt-out
                  queue. Your email connection above stays saved while you scan.
                </p>
                {onStartScan && (
                  <button
                    type="button"
                    onClick={onStartScan}
                    className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Run Exposure Audit Scan
                  </button>
                )}
              </div>
            )}

            {exposedBrokers.length > 0 && filteredQueue.length === 0 && (
              <div className="p-6 text-center bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-400">
                No brokers match the current filter.
              </div>
            )}
          </div>
        </div>

        {/* Right: Statutory Notice Editor & Dispatch Controls */}
        <div className="lg:col-span-8 space-y-6">
          {activeBroker ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
              {/* Target Broker Summary */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Recipient Compliance Desk</span>
                    {activeResult?.optOutConfirmationCode && hasVerifiedEmailReceipt(activeResult) && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-400 font-mono">
                          Receipt: {activeResult.optOutConfirmationCode}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-xl font-bold text-white">{activeBroker.name}</h3>
                    <a
                      href={`https://${activeBroker.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-400 hover:text-emerald-400 inline-flex items-center gap-1 font-mono"
                    >
                      <span>{activeBroker.domain}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="text-xs text-emerald-400 font-mono flex flex-wrap items-center gap-1.5 pt-0.5">
                    <Mail className="w-3.5 h-3.5" />
                    <span>To: {activeBroker.privacyEmail}</span>
                    {activeSenderEmail && (
                      <>
                        <span className="text-slate-600">·</span>
                        <span className="text-slate-300">From: {activeSenderEmail}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={getBrokerRecordSearchUrl(activeBroker, profile)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Search className="w-3.5 h-3.5 text-sky-400" />
                    <span>Verify Broker Listing</span>
                  </a>
                </div>
              </div>

              {/* Status Feedback */}
              {sendSuccessMsg && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div className="space-y-0.5">
                    <span className="font-bold block">Opt-Out Email Sent on Your Behalf</span>
                    <span className="font-mono text-[11px] text-emerald-400">{sendSuccessMsg}</span>
                  </div>
                </div>
              )}

              {sendErrorMsg && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                  <span>{sendErrorMsg}</span>
                </div>
              )}

              {/* Subject & Body Editor */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Statutory Subject Line
                  </label>
                  <input
                    type="text"
                    value={customSubject}
                    onChange={(e) => setCustomSubject(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">
                      Binding Legal Expungement Demand (Sent on Your Behalf)
                    </label>
                    <button
                      type="button"
                      onClick={handleCopyNotice}
                      className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Notice</span>
                        </>
                      )}
                    </button>
                  </div>
                  <textarea
                    rows={12}
                    value={customBody}
                    onChange={(e) => setCustomBody(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-emerald-500/50 resize-y"
                  />
                </div>
              </div>

              {/* Dispatch Controls */}
              <div className="pt-4 border-t border-slate-800 space-y-4">
                {isAccountConnectedForDirectSend && smtpConnection?.verified && (
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bccSelf}
                      onChange={(e) => setBccSelf(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-emerald-500"
                    />
                    <span>BCC a copy of sent opt-out emails to {activeSenderEmail}</span>
                  </label>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Left Secondary Action: Check Gmail Inbox when OAuth connected */}
                  <div className="flex flex-wrap items-center gap-2">
                    {oauthUser && (
                      <button
                        type="button"
                        onClick={handleScanInboxForReplies}
                        disabled={isSearchingInbox}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {isSearchingInbox ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Inbox className="w-3.5 h-3.5 text-sky-400" />
                        )}
                        <span>Check Gmail for Broker Replies</span>
                      </button>
                    )}
                  </div>

                  {/* Primary Send Button */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    {connectionMode !== 'webmail' && (
                      <button
                        type="button"
                        onClick={requestSingleSendConfirmation}
                        disabled={isSending || !isAccountConnectedForDirectSend}
                        className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
                      >
                        {isSending ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Sending on Your Behalf...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            <span>
                              {isAccountConnectedForDirectSend
                                ? `Send from ${activeSenderEmail}`
                                : 'Connect Email Above to Send Directly'}
                            </span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Always-Available 1-Click Webmail Compose Bar */}
                {webmailLinks && (
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/70 text-xs">
                    <span className="text-slate-400">
                      Or open pre-addressed notice in your webmail:
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={webmailLinks.gmailUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() =>
                          onMarkDispatched(
                            activeBroker.id,
                            `WEB-GMAIL-${Date.now().toString(36).toUpperCase()}`
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <span>Gmail Web</span>
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                      </a>
                      <a
                        href={webmailLinks.outlookUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() =>
                          onMarkDispatched(
                            activeBroker.id,
                            `WEB-OUTLOOK-${Date.now().toString(36).toUpperCase()}`
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <span>Outlook.com</span>
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                      </a>
                      <a
                        href={webmailLinks.yahooUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() =>
                          onMarkDispatched(
                            activeBroker.id,
                            `WEB-YAHOO-${Date.now().toString(36).toUpperCase()}`
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <span>Yahoo Mail</span>
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                      </a>
                      <a
                        href={webmailLinks.mailtoUrl}
                        onClick={() =>
                          onMarkDispatched(
                            activeBroker.id,
                            `MAILTO-${Date.now().toString(36).toUpperCase()}`
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <span>Default Mail App</span>
                        <Mail className="w-3 h-3 text-slate-400" />
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Inbox Verification Results */}
              {inboxSearched && (
                <div className="pt-6 border-t border-slate-800 space-y-3">
                  <h4 className="text-xs font-semibold text-white flex items-center gap-1.5 tabular-nums">
                    <Inbox className="w-4 h-4 text-sky-400" />
                    <span>Detected Broker Replies &amp; Confirmation Links ({inboxEmails.length})</span>
                  </h4>

                  {inboxEmails.length > 0 ? (
                    <div className="space-y-2">
                      {inboxEmails.map((msg) => (
                        <div
                          key={msg.id}
                          className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2"
                        >
                          <div className="flex items-center justify-between text-xs gap-2">
                            <span className="font-semibold text-white truncate">
                              {msg.subject || 'No Subject'}
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono shrink-0">
                              {msg.date}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">{msg.snippet}</p>
                          {msg.verificationLinks.length > 0 && (
                            <div className="space-y-1 pt-1">
                              <span className="text-[11px] text-emerald-400 font-medium block">
                                Extracted Opt-Out Confirmation Link:
                              </span>
                              {msg.verificationLinks.map((link, idx) => (
                                <a
                                  key={idx}
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-sky-400 hover:underline flex items-center gap-1 font-mono break-all"
                                >
                                  <Link2 className="w-3 h-3 shrink-0" />
                                  <span>{link}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-400 text-center">
                      No matching confirmation messages found in Gmail for{' '}
                      <strong className="text-slate-200">{activeBroker.name}</strong> yet. Most data
                      brokers respond within 24–72 hours.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <Mail className="w-8 h-8 text-slate-600 mx-auto" />
              <div className="text-sm font-semibold text-white">No Broker Selected</div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Connect your email account above, then run an exposure scan or select a broker from
                the queue to review and send statutory deletion demands on your behalf.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mandatory User Confirmation Modal before Sending Emails on User's Behalf */}
      {pendingConfirmation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-send-title"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="space-y-1">
                <h3 id="confirm-send-title" className="text-lg font-bold text-white">
                  {pendingConfirmation.type === 'single'
                    ? 'Confirm Sending Opt-Out Email on Your Behalf'
                    : `Confirm Sending ${pendingConfirmation.targets.length} Opt-Out Emails on Your Behalf`}
                </h3>
                <p className="text-xs text-slate-400">
                  synOUT will transmit statutory deletion demands directly from{' '}
                  <strong className="text-emerald-400 font-mono">{activeSenderEmail}</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingConfirmation(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                aria-label="Cancel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-300 tabular-nums">
                Recipient Data Broker{pendingConfirmation.targets.length > 1 ? 's' : ''} (
                {pendingConfirmation.targets.length}):
              </div>
              <div className="max-h-48 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl divide-y divide-slate-800/80">
                {pendingConfirmation.targets.map(({ broker }) => (
                  <div
                    key={broker.id}
                    className="px-3.5 py-2 flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="font-medium text-white truncate">{broker.name}</span>
                    <span className="text-slate-400 font-mono truncate">{broker.privacyEmail}</span>
                  </div>
                ))}
              </div>
            </div>

            {smtpConnection?.verified && (
              <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bccSelf}
                  onChange={(e) => setBccSelf(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 bg-slate-950 text-emerald-500"
                />
                <span>
                  BCC a copy of each sent demand to <strong className="font-mono text-white">{activeSenderEmail}</strong>
                </span>
              </label>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPendingConfirmation(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmedSend}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {pendingConfirmation.type === 'single'
                    ? 'Confirm & Send Email'
                    : `Confirm & Send ${pendingConfirmation.targets.length} Emails`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
