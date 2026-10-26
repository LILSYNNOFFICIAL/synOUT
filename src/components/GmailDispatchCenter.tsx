import React, { useState, useMemo, useEffect } from 'react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import { getBrokerRecordSearchUrl } from '../utils/scanEngine';
import { getExhaustiveBrokerRegistry } from '../utils/dynamicBrokerRegistry';
import {
  EMAIL_PROVIDER_PRESETS,
  EmailProviderId,
  WebmailLauncherId,
  detectProviderFromEmail,
  detectWebmailLauncherFromEmail,
  inferCustomSmtpDefaults,
  buildWebmailComposeUrls,
} from '../utils/emailProviderConfig';
import { getAccessToken } from '../services/googleAuth';
import {
  searchBrokerVerificationEmails,
  GmailMessageSummary,
} from '../services/gmailApi';
import {
  SmtpVerificationError,
  useEmailConnection,
  setEmailConnectionMode,
  verifyAndConnectSmtpAccount,
  disconnectSmtpAccount,
  connectGoogleOAuthAccount,
  connectGoogleOAuthWithToken,
  saveGoogleOAuthClientConfig,
  clearGoogleOAuthClientConfig,
  disconnectGoogleOAuthAccount,
  connectWebmailSenderAccount,
  disconnectWebmailSenderAccount,
  findBrokerById,
  hasVerifiedEmailReceipt,
  buildStatutoryNoticeForBroker,
  sendEmailViaConnectedAccount,
} from '../services/emailConnectionStore';
import { copyTextToClipboard } from '../utils/exportEngines';
import {
  resolveBrokerContactProfile,
  useBrokerContactOverrides,
  setBrokerCustomEmail,
  resetBrokerContactOverride,
  markBrokerEmailBounced,
  verifyRecipientDeliverabilityClient,
  RecipientDeliverabilityVerification,
} from '../utils/brokerContactResolver';
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
  Edit3,
  RotateCcw,
  Flame,
  Eye,
  EyeOff,
  KeyRound,
  Settings2,
} from 'lucide-react';

interface GmailDispatchCenterProps {
  results: ScanResult[];
  profile: UserProfile;
  onMarkDispatched: (brokerId: string, messageId: string, silent?: boolean) => void;
  onOpenPowerOfAttorney: () => void;
  onStartScan?: () => void;
  onOpenNukeAll?: () => void;
  onOpenInboxHarvester?: () => void;
}

interface PendingSendConfirmation {
  type: 'single' | 'batch';
  targets: {
    broker: DataBroker;
    recipientEmail: string;
    fallbackEmails: string[];
    ccEmails: string[];
    deliverabilityLabel: string;
    subject: string;
    body: string;
  }[];
}

export const GmailDispatchCenter: React.FC<GmailDispatchCenterProps> = ({
  results,
  profile,
  onMarkDispatched,
  onOpenPowerOfAttorney,
  onStartScan,
  onOpenNukeAll,
  onOpenInboxHarvester,
}) => {
  const {
    mode: connectionMode,
    smtp: smtpConnection,
    oauthUser,
    oauthAccessToken: accessToken,
    oauthTokenExpired,
    oauthConfigured,
    oauthClientSource,
    customOAuthClientId,
    webmailSender,
    backendAvailable,
    isDirectSendConnected: isAccountConnectedForDirectSend,
    isWebmailConnected,
    activeConnectedEmail,
  } = useEmailConnection();

  // Form inputs for Direct Email / App Password connection
  const initialEmail =
    smtpConnection?.userEmail ||
    webmailSender?.userEmail ||
    profile.emails.find((e) => Boolean(e && e.trim())) ||
    '';
  const [smtpEmail, setSmtpEmail] = useState<string>(initialEmail);
  const [smtpProvider, setSmtpProvider] = useState<EmailProviderId>(() =>
    smtpConnection?.provider || detectProviderFromEmail(initialEmail)
  );
  const [smtpAppPassword, setSmtpAppPassword] = useState<string>('');
  const [showSmtpPassword, setShowSmtpPassword] = useState<boolean>(false);
  const [customHost, setCustomHost] = useState<string>(smtpConnection?.customHost || '');
  const [customPort, setCustomPort] = useState<number>(smtpConnection?.customPort || 587);
  const [customSecure, setCustomSecure] = useState<boolean>(smtpConnection?.customSecure || false);
  const [customProviderHint, setCustomProviderHint] = useState<string | null>(null);
  const [rememberInBrowser, setRememberInBrowser] = useState<boolean>(
    smtpConnection ? smtpConnection.rememberInBrowser : true
  );
  const [bccSelf, setBccSelf] = useState<boolean>(false);

  const [isVerifyingSmtp, setIsVerifyingSmtp] = useState<boolean>(false);
  const [smtpError, setSmtpError] = useState<string | null>(null);
  const [smtpSuggestOAuth, setSmtpSuggestOAuth] = useState<boolean>(false);
  const [smtpSuggestWebmail, setSmtpSuggestWebmail] = useState<boolean>(false);

  // Google OAuth 2.0 & Direct Token Login state
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [isAuthenticatingOAuth, setIsAuthenticatingOAuth] = useState<boolean>(false);
  const [showOAuthConfigDrawer, setShowOAuthConfigDrawer] = useState<boolean>(false);
  const [oauthClientIdDraft, setOauthClientIdDraft] = useState<string>(customOAuthClientId || '');
  const [oauthConfigFeedback, setOauthConfigFeedback] = useState<string | null>(null);
  const [originCopied, setOriginCopied] = useState<boolean>(false);
  const [showTokenFallback, setShowTokenFallback] = useState<boolean>(false);
  const [manualAccessTokenDraft, setManualAccessTokenDraft] = useState<string>('');

  // Instant Webmail Sender Login state
  const [webmailEmailInput, setWebmailEmailInput] = useState<string>(
    webmailSender?.userEmail || initialEmail
  );
  const [webmailLauncher, setWebmailLauncher] = useState<WebmailLauncherId>(
    webmailSender?.preferredLauncher || detectWebmailLauncherFromEmail(initialEmail)
  );
  const [webmailError, setWebmailError] = useState<string | null>(null);

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

  // Recipient DPO Mitigation, Custom Override & Live DNS MX Check State
  const contactOverrides = useBrokerContactOverrides();
  const [ccBackupDpo, setCcBackupDpo] = useState<boolean>(true);
  const [isEditingRecipient, setIsEditingRecipient] = useState<boolean>(false);
  const [recipientDraft, setRecipientDraft] = useState<string>('');
  const [recipientOverrideError, setRecipientOverrideError] = useState<string | null>(null);
  const [mxCheckState, setMxCheckState] = useState<RecipientDeliverabilityVerification | null>(null);
  const [isCheckingMx, setIsCheckingMx] = useState<boolean>(false);

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
    const q = searchQuery.toLowerCase();
    return exposedBrokers.filter(({ broker, result }) => {
      const resolved = resolveBrokerContactProfile(broker, contactOverrides);
      const matchesSearch =
        broker.name.toLowerCase().includes(q) ||
        broker.domain.toLowerCase().includes(q) ||
        resolved.effectivePrimaryEmail.toLowerCase().includes(q) ||
        (broker.privacyEmail || '').toLowerCase().includes(q);
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
  }, [exposedBrokers, searchQuery, queueFilter, contactOverrides]);

  useEffect(() => {
    if (!selectedBrokerId && exposedBrokers.length > 0) {
      setSelectedBrokerId(exposedBrokers[0].broker.id);
    }
  }, [exposedBrokers, selectedBrokerId]);

  const activeBroker = useMemo(
    () => (selectedBrokerId ? findBrokerById(selectedBrokerId) : undefined),
    [selectedBrokerId]
  );

  const activeContact = useMemo(
    () => (activeBroker ? resolveBrokerContactProfile(activeBroker, contactOverrides) : null),
    [activeBroker, contactOverrides]
  );

  const activeResult = useMemo(
    () => results.find((r) => r.brokerId === selectedBrokerId),
    [results, selectedBrokerId]
  );

  useEffect(() => {
    setIsEditingRecipient(false);
    setRecipientOverrideError(null);
    setMxCheckState(null);
  }, [selectedBrokerId]);

  const generatedNotice = useMemo(() => {
    if (!activeBroker) return { subject: '', body: '' };
    return buildStatutoryNoticeForBroker(activeBroker, profile, activeSenderEmail);
  }, [activeBroker, profile, activeSenderEmail, contactOverrides]);

  useEffect(() => {
    setCustomSubject(generatedNotice.subject);
    setCustomBody(generatedNotice.body);
    setSendSuccessMsg(null);
    setSendErrorMsg(null);
  }, [generatedNotice]);

  const handleEmailInputChange = (val: string) => {
    setSmtpEmail(val);
    setWebmailEmailInput(val);
    if (val.includes('@')) {
      const detected = detectProviderFromEmail(val);
      setSmtpProvider(detected);
      setWebmailLauncher(detectWebmailLauncherFromEmail(val));
      if (detected === 'custom') {
        const inferred = inferCustomSmtpDefaults(val);
        if (inferred) {
          setCustomHost(inferred.host);
          setCustomPort(inferred.port);
          setCustomSecure(inferred.secure);
          setCustomProviderHint(inferred.providerHint);
        } else {
          setCustomProviderHint(null);
        }
      } else {
        setCustomProviderHint(null);
      }
    }
  };

  const handleVerifySmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifyingSmtp(true);
    setSmtpError(null);
    setSmtpSuggestOAuth(false);
    setSmtpSuggestWebmail(false);

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
      if (err instanceof SmtpVerificationError) {
        setSmtpError(err.message);
        setSmtpSuggestOAuth(err.suggestOAuth);
        setSmtpSuggestWebmail(err.suggestWebmail);
      } else {
        setSmtpError(err instanceof Error ? err.message : 'Connection verification failed.');
        setSmtpSuggestOAuth(smtpProvider === 'gmail');
        setSmtpSuggestWebmail(true);
      }
    } finally {
      setIsVerifyingSmtp(false);
    }
  };

  const handleDisconnectSmtp = async () => {
    await disconnectSmtpAccount();
    setSmtpAppPassword('');
    setSmtpError(null);
  };

  const handleSaveOAuthClientId = async (e: React.FormEvent) => {
    e.preventDefault();
    setOauthError(null);
    setOauthConfigFeedback(null);
    try {
      await saveGoogleOAuthClientConfig(oauthClientIdDraft);
      setOauthConfigFeedback(
        'Saved Google OAuth Client ID in this browser. Click "Sign in with Google" to authorize.'
      );
      setShowOAuthConfigDrawer(false);
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : 'Invalid Google OAuth Client ID.');
    }
  };

  const handleClearOAuthClientId = async () => {
    await clearGoogleOAuthClientConfig();
    setOauthClientIdDraft('');
    setOauthConfigFeedback(null);
  };

  const handleGoogleOAuthSignIn = async (silentIfPossible = false) => {
    setIsAuthenticatingOAuth(true);
    setOauthError(null);
    setOauthConfigFeedback(null);
    try {
      await connectGoogleOAuthAccount({
        loginHint: oauthUser?.email || (smtpEmail.endsWith('@gmail.com') ? smtpEmail : undefined),
        rememberInBrowser,
        silentIfPossible,
      });
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : 'Google OAuth sign-in failed.');
    } finally {
      setIsAuthenticatingOAuth(false);
    }
  };

  const handleManualTokenSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticatingOAuth(true);
    setOauthError(null);
    try {
      await connectGoogleOAuthWithToken(manualAccessTokenDraft, rememberInBrowser);
      setManualAccessTokenDraft('');
      setShowTokenFallback(false);
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : 'Gmail OAuth token verification failed.');
    } finally {
      setIsAuthenticatingOAuth(false);
    }
  };

  const handleGoogleOAuthSignOut = async () => {
    await disconnectGoogleOAuthAccount();
    setSelfTestReceipt(null);
    setSelfTestError(null);
  };

  const handleConnectWebmailSender = (e?: React.FormEvent, emailOverride?: string) => {
    if (e) e.preventDefault();
    setWebmailError(null);
    const targetEmail = (emailOverride ?? webmailEmailInput).trim();
    try {
      connectWebmailSenderAccount({
        userEmail: targetEmail,
        senderName: `${profile.firstName} ${profile.lastName}`.trim() || undefined,
        preferredLauncher: emailOverride
          ? detectWebmailLauncherFromEmail(emailOverride)
          : webmailLauncher,
        rememberInBrowser,
      });
      setWebmailEmailInput(targetEmail.toLowerCase());
      setSmtpError(null);
    } catch (err) {
      setWebmailError(err instanceof Error ? err.message : 'Enter a valid email address.');
    }
  };

  const handleDisconnectWebmailSender = () => {
    disconnectWebmailSenderAccount();
    setWebmailError(null);
  };

  const currentOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const handleCopyOrigin = () => {
    void copyTextToClipboard(currentOrigin);
    setOriginCopied(true);
    setTimeout(() => setOriginCopied(false), 2000);
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

  const handleOpenRecipientEditor = () => {
    if (!activeContact) return;
    setRecipientDraft(activeContact.effectivePrimaryEmail);
    setRecipientOverrideError(null);
    setIsEditingRecipient(true);
  };

  const handleSaveRecipientOverride = (emailToSave?: string) => {
    if (!activeBroker) return;
    const candidate = (emailToSave ?? recipientDraft).trim();
    try {
      setBrokerCustomEmail(activeBroker.id, candidate);
      setIsEditingRecipient(false);
      setRecipientOverrideError(null);
      setMxCheckState(null);
    } catch (err) {
      setRecipientOverrideError(
        err instanceof Error ? err.message : 'Enter a valid compliance email address.'
      );
    }
  };

  const handleResetRecipientOverride = () => {
    if (!activeBroker) return;
    resetBrokerContactOverride(activeBroker.id);
    setIsEditingRecipient(false);
    setRecipientOverrideError(null);
    setMxCheckState(null);
  };

  const handleMarkCurrentRecipientBounced = () => {
    if (!activeBroker || !activeContact?.effectivePrimaryEmail) return;
    markBrokerEmailBounced(activeBroker.id, activeContact.effectivePrimaryEmail);
    setMxCheckState(null);
  };

  const handleCheckActiveRecipientMx = async () => {
    if (!activeContact?.effectivePrimaryEmail) return;
    setIsCheckingMx(true);
    setSendErrorMsg(null);
    try {
      const result = await verifyRecipientDeliverabilityClient(
        activeContact.effectivePrimaryEmail,
        activeContact.fallbackEmails
      );
      setMxCheckState(result);
    } catch (err) {
      setSendErrorMsg(
        err instanceof Error ? err.message : 'DNS MX verification check failed.'
      );
    } finally {
      setIsCheckingMx(false);
    }
  };

  const requestSingleSendConfirmation = () => {
    if (!activeBroker || !activeContact?.effectivePrimaryEmail) {
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
          recipientEmail: activeContact.effectivePrimaryEmail,
          fallbackEmails: activeContact.fallbackEmails,
          ccEmails: ccBackupDpo ? activeContact.recommendedCcEmails : [],
          deliverabilityLabel: activeContact.deliverabilityLabel,
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
      const contact = resolveBrokerContactProfile(broker, contactOverrides);
      const notice = buildStatutoryNoticeForBroker(broker, profile, activeSenderEmail);
      return {
        broker,
        recipientEmail: contact.effectivePrimaryEmail,
        fallbackEmails: contact.fallbackEmails,
        ccEmails: ccBackupDpo ? contact.recommendedCcEmails : [],
        deliverabilityLabel: contact.deliverabilityLabel,
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
          recipientEmail: target.recipientEmail,
          fallbackRecipientEmails: target.fallbackEmails,
          ccEmails: target.ccEmails,
          subject: target.subject,
          body: target.body,
          senderName,
          brokerId: target.broker.id,
          brokerName: target.broker.name,
          brokerDomain: target.broker.domain,
          bccSelf,
        });
        const actualRecipient = res.deliveredTo || target.recipientEmail;
        if (res.usedFallback && actualRecipient.toLowerCase() !== target.recipientEmail.toLowerCase()) {
          markBrokerEmailBounced(target.broker.id, target.recipientEmail);
        }
        onMarkDispatched(target.broker.id, res.messageId, false);
        setSendSuccessMsg(
          `Sent from ${res.sentFrom} to ${actualRecipient}${
            res.usedFallback ? ' (auto-rerouted via verified backup DPO)' : ''
          }${
            res.ccDelivered && res.ccDelivered.length > 0
              ? ` · CC: ${res.ccDelivered.join(', ')}`
              : ''
          } · Message Receipt: ${res.messageId}`
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
    let reroutedCount = 0;
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
          recipientEmail: target.recipientEmail,
          fallbackRecipientEmails: target.fallbackEmails,
          ccEmails: target.ccEmails,
          subject: target.subject,
          body: target.body,
          senderName,
          brokerId: target.broker.id,
          brokerName: target.broker.name,
          brokerDomain: target.broker.domain,
          bccSelf,
        });
        if (res.usedFallback) {
          reroutedCount++;
          markBrokerEmailBounced(target.broker.id, target.recipientEmail);
        }
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
        `Sent all ${sentCount} statutory opt-out emails directly from ${activeSenderEmail}${
          reroutedCount > 0 ? ` (${reroutedCount} auto-rerouted to verified backup DPO)` : ''
        }. Copies are in your Sent folder.`
      );
    } else if (sentCount > 0 && failures.length > 0) {
      setSendSuccessMsg(
        `Sent ${sentCount} of ${total} notices from ${activeSenderEmail}${
          reroutedCount > 0 ? ` (${reroutedCount} auto-rerouted)` : ''
        }.`
      );
      setSendErrorMsg(`${failures.length} require manual portal action: ${failures[0]}`);
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
    const targetEmail = activeContact?.effectivePrimaryEmail || activeBroker?.privacyEmail;
    if (!targetEmail) return null;
    return buildWebmailComposeUrls(targetEmail, customSubject, customBody);
  }, [activeContact, activeBroker, customSubject, customBody]);

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8">
      {/* Header & Connection Panel */}
      <section className="p-6 sm:p-8 glass-panel rounded-2xl space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
              <span className="text-emerald-400 font-semibold">Easy Email Removal</span>
              <span aria-hidden="true">·</span>
              <span>{exposedBrokers.length} Broker Privacy Inboxes Ready</span>
              <span aria-hidden="true">·</span>
              <span>{submittedBrokersCount} Removal Emails Sent</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight [text-wrap:balance]">
              Remove Your Records by Email — Written &amp; Sent For You
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Connecting your email takes less than a minute and stays saved across the site. Pick
              whichever option below feels most comfortable — <strong>no technical setup required</strong>{' '}
              — and synOUT will prepare and send legal deletion notices on your behalf.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {onOpenInboxHarvester && (
              <button
                type="button"
                onClick={onOpenInboxHarvester}
                className="px-4 py-2.5 rounded-xl glass-card text-sky-300 hover:text-white text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                <Inbox className="w-4 h-4 text-sky-400" />
                <span>Check Broker Replies</span>
              </button>
            )}

            <button
              onClick={onOpenPowerOfAttorney}
              className="px-4 py-2.5 rounded-xl glass-card text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <FileText className="w-4 h-4 text-emerald-400" />
              <span>Authorize Agent (Optional)</span>
            </button>

            {onOpenNukeAll && (
              <button
                type="button"
                onClick={onOpenNukeAll}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white border border-red-400/30 text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                <Flame className="w-4 h-4" />
                <span>NUKE ALL</span>
              </button>
            )}
          </div>
        </div>

        {/* Friendly Connection Mode Switcher */}
        <div className="pt-4 border-t border-white/[0.07] space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-300">
                Choose how you want to send removal emails:
              </div>
              <div className="inline-flex flex-wrap items-center gap-1 p-1 glass-subtle rounded-xl">
                <button
                  type="button"
                  onClick={() => setEmailConnectionMode('webmail')}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    connectionMode === 'webmail'
                      ? 'bg-emerald-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  1-Click Webmail (Easiest · No Password)
                </button>
                <button
                  type="button"
                  onClick={() => setEmailConnectionMode('smtp')}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    connectionMode === 'smtp'
                      ? 'bg-emerald-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Auto-Send in Background (2-Step App Code)
                </button>
                <button
                  type="button"
                  onClick={() => setEmailConnectionMode('oauth')}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    connectionMode === 'oauth'
                      ? 'bg-emerald-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Sign in with Google
                </button>
              </div>
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
                    ? `Send to All ${pendingBrokers.length} Pending Brokers For Me`
                    : `Re-Send to All ${exposedBrokers.length} Exposed Brokers`}
                </span>
              </button>
            )}
          </div>

          {/* Mode 1: Auto-Send in Background (Guided 2-Step App Code) */}
          {connectionMode === 'smtp' && (
            <div className="space-y-4">
              {backendAvailable === false && !smtpConnection?.verified && (
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-200">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-amber-300 block">
                      Browser-Only Mode Active — Use 1-Click Webmail Instead
                    </span>
                    <span className="text-slate-300">
                      This preview host doesn&apos;t run background mail servers. Switch to{' '}
                      <strong>1-Click Webmail (No Password)</strong> to send right away in one click!
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEmailConnectionMode('webmail')}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold cursor-pointer whitespace-nowrap"
                    >
                      Use 1-Click Webmail (No Password)
                    </button>
                  </div>
                </div>
              )}

              {smtpConnection?.verified ? (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3.5 px-4 bg-slate-950 border border-emerald-500/30 rounded-xl">
                    <div className="flex items-center gap-3 min-w-0">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">
                          Connected as {smtpConnection.userEmail}
                        </div>
                        <div className="text-xs text-slate-400">
                          Ready to send removal emails automatically on your behalf ·{' '}
                          {smtpConnection.rememberInBrowser
                            ? 'Saved on this browser'
                            : 'Saved for this tab'}
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
                </div>
              ) : (
                <form onSubmit={handleVerifySmtp} className="space-y-4">
                  {/* Calm 3-Step Visual Guide */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                      <div className="font-bold text-white">1. Type Your Email</div>
                      <p className="text-slate-400">
                        We automatically detect Gmail, Outlook, Yahoo, iCloud, or Proton for you.
                      </p>
                    </div>
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                      <div className="font-bold text-white">2. Copy a Safe App Code</div>
                      <p className="text-slate-400">
                        Click <strong className="text-emerald-400">Get 16-Letter App Code</strong>{' '}
                        so you never share your main password.
                      </p>
                    </div>
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                      <div className="font-bold text-white">3. Done — Hands-Free Sending</div>
                      <p className="text-slate-400">
                        synOUT sends every removal email automatically in the background for you.
                      </p>
                    </div>
                  </div>

                  {/* Provider Selector */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-400 mr-1">Email provider:</span>
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
                        Step 1: Your Email Address
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
                          Step 2: {activePreset.credentialLabel}
                        </label>
                        {activePreset.appPasswordUrl && (
                          <a
                            href={activePreset.appPasswordUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-emerald-400 hover:underline font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                          >
                            <span>Get 16-Letter App Code</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type={showSmtpPassword ? 'text' : 'password'}
                          required
                          autoComplete="off"
                          value={smtpAppPassword}
                          onChange={(e) => setSmtpAppPassword(e.target.value)}
                          placeholder={
                            smtpProvider === 'icloud'
                              ? 'xxxx-xxxx-xxxx-xxxx'
                              : 'xxxx xxxx xxxx xxxx'
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-3.5 pr-9 py-2.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500/60"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSmtpPassword((v) => !v)}
                          aria-label={showSmtpPassword ? 'Hide code' : 'Show code'}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                        >
                          {showSmtpPassword ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
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
                            <span>Connecting...</span>
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
                          Mail Server Address{' '}
                          {customProviderHint && (
                            <span className="text-emerald-400 font-normal">
                              ({customProviderHint})
                            </span>
                          )}
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
                          Server Port
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
                          <option value={587}>587 (Standard)</option>
                          <option value={465}>465 (SSL)</option>
                          <option value={2525}>2525 (Alternate)</option>
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
                          <span>Use SSL (Port 465)</span>
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
                      <span>Keep my email connected on this browser</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => setEmailConnectionMode('webmail')}
                      className="text-xs text-sky-400 hover:text-sky-300 font-medium cursor-pointer"
                    >
                      Don&apos;t want to create an App Code? Use 1-Click Webmail instead →
                    </button>
                  </div>

                  <p className="text-xs text-slate-400">{activePreset.helpText}</p>
                </form>
              )}

              {smtpError && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-xl text-xs text-rose-200 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                    <span>{smtpError}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-6">
                    {(smtpSuggestWebmail || smtpEmail.includes('@')) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (smtpEmail.includes('@')) {
                            handleConnectWebmailSender(undefined, smtpEmail);
                          } else {
                            setEmailConnectionMode('webmail');
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {smtpEmail.includes('@')
                          ? `Use 1-Click Webmail Instead (${smtpEmail.trim()})`
                          : 'Switch to 1-Click Webmail (No Password)'}
                      </button>
                    )}
                    {activePreset.appPasswordUrl && (
                      <a
                        href={activePreset.appPasswordUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                      >
                        <span>Open {activePreset.shortLabel} App Code Page</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {smtpSuggestOAuth && oauthConfigured && (
                      <button
                        type="button"
                        onClick={() => setEmailConnectionMode('oauth')}
                        className="px-3 py-1.5 rounded-lg bg-white text-slate-950 font-bold hover:bg-slate-100 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Sign in with Google
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode 2: Sign in with Google */}
          {connectionMode === 'oauth' && (
            <div className="space-y-4">
              {oauthUser && accessToken && !oauthTokenExpired ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3.5 px-4 bg-slate-950 border border-emerald-500/30 rounded-xl">
                  <div className="flex items-center gap-3 min-w-0">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        Connected as {oauthUser.email}
                      </div>
                      <div className="text-xs text-slate-400">
                        Google Account Connected · Automatic Gmail Sending &amp; Reply Checking Active
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
                      onClick={handleGoogleOAuthSignOut}
                      className="px-3.5 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Disconnect Google
                    </button>
                  </div>
                </div>
              ) : oauthUser && oauthTokenExpired ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3.5 px-4 bg-slate-950 border border-amber-500/30 rounded-xl">
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-amber-300">
                      Google Session Expired for {oauthUser.email}
                    </div>
                    <p className="text-xs text-slate-400">
                      For your security, Google sign-in sessions refresh every hour. Click Reconnect
                      Google to continue in one click.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleGoogleOAuthSignIn(true)}
                      disabled={isAuthenticatingOAuth}
                      className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs cursor-pointer whitespace-nowrap"
                    >
                      {isAuthenticatingOAuth ? 'Reconnecting...' : 'Reconnect Google'}
                    </button>
                    <button
                      type="button"
                      onClick={handleGoogleOAuthSignOut}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer whitespace-nowrap"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 px-4 bg-slate-950 border border-slate-800 rounded-xl">
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-white">
                        {oauthConfigured
                          ? 'Sign in with Your Google Account'
                          : 'Want to Send From Gmail Without Any Setup?'}
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                        {oauthConfigured
                          ? 'Authorize Gmail in one click so synOUT can send removal emails and check for broker confirmation links on your behalf.'
                          : 'Google Sign-In Popup requires an administrator Google Cloud ID on custom hosts. To use your @gmail.com address right away with zero technical setup, click 1-Click Gmail Webmail or 2-Step App Code.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {oauthConfigured ? (
                        <button
                          type="button"
                          onClick={() => void handleGoogleOAuthSignIn(false)}
                          disabled={isAuthenticatingOAuth}
                          className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-xs flex items-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
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
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setEmailConnectionMode('webmail')}
                            className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold cursor-pointer whitespace-nowrap"
                          >
                            Use 1-Click Gmail Webmail
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSmtpProvider('gmail');
                              setEmailConnectionMode('smtp');
                            }}
                            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer whitespace-nowrap"
                          >
                            Use 2-Step Gmail App Code
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => setShowOAuthConfigDrawer((v) => !v)}
                        className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                        <span>
                          {showOAuthConfigDrawer ? 'Hide Advanced Setup' : 'Advanced Setup'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Optional Advanced Developer Setup Drawer (Hidden by Default so Users Aren't Intimidated) */}
                  {showOAuthConfigDrawer && (
                    <div className="space-y-3">
                      <form
                        onSubmit={handleSaveOAuthClientId}
                        className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-white">
                            Optional Developer Setting: Custom Google OAuth Web Client ID
                          </span>
                          <a
                            href="https://console.cloud.google.com/apis/credentials"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <span>Open Google Cloud Credentials</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-slate-900 border border-slate-800 rounded-lg">
                          <div className="text-slate-300">
                            Authorized JavaScript Origin:{' '}
                            <code className="text-emerald-400 font-mono">{currentOrigin}</code>
                          </div>
                          <button
                            type="button"
                            onClick={handleCopyOrigin}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium inline-flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
                          >
                            {originCopied ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400">Copied Origin</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy Origin</span>
                              </>
                            )}
                          </button>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            required
                            value={oauthClientIdDraft}
                            onChange={(e) => setOauthClientIdDraft(e.target.value)}
                            placeholder="1234567890-abcdefg.apps.googleusercontent.com"
                            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                          />
                          <button
                            type="submit"
                            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-colors cursor-pointer whitespace-nowrap"
                          >
                            Save Client ID
                          </button>
                          {customOAuthClientId && (
                            <button
                              type="button"
                              onClick={() => void handleClearOAuthClientId()}
                              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer whitespace-nowrap"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </form>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setShowTokenFallback((v) => !v)}
                          className="text-slate-400 hover:text-emerald-400 inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>
                            {showTokenFallback
                              ? 'Hide Direct Token Input'
                              : 'Popup blocked? Paste a temporary Google Access Token'}
                          </span>
                        </button>
                      </div>

                      {showTokenFallback && (
                        <form
                          onSubmit={handleManualTokenSignIn}
                          className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5 text-xs"
                        >
                          <p className="text-slate-400">
                            Paste a temporary Google OAuth Access Token authorized for Gmail send:
                          </p>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="password"
                              required
                              autoComplete="off"
                              value={manualAccessTokenDraft}
                              onChange={(e) => setManualAccessTokenDraft(e.target.value)}
                              placeholder="Access token..."
                              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                            />
                            <button
                              type="submit"
                              disabled={isAuthenticatingOAuth}
                              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                            >
                              {isAuthenticatingOAuth ? 'Verifying...' : 'Verify & Connect'}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              )}

              {oauthConfigFeedback && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{oauthConfigFeedback}</span>
                </div>
              )}

              {oauthError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{oauthError}</span>
                </div>
              )}
            </div>
          )}

          {/* Mode 3: 1-Click Webmail (Easiest — No Password Needed) */}
          {connectionMode === 'webmail' && (
            <div className="space-y-3">
              {isWebmailConnected && webmailSender ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3.5 px-4 bg-slate-950 border border-sky-500/35 rounded-xl">
                  <div className="flex items-center gap-3 min-w-0">
                    <CheckCircle2 className="w-5 h-5 text-sky-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        Ready to Send From {webmailSender.userEmail}
                      </div>
                      <div className="text-xs text-slate-400">
                        1-Click Webmail Mode · Opens pre-written, pre-addressed removal emails in{' '}
                        <strong className="text-sky-300 uppercase">
                          {webmailSender.preferredLauncher}
                        </strong>{' '}
                        so you just click Send (zero passwords shared)
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {onOpenNukeAll && (
                      <button
                        type="button"
                        onClick={onOpenNukeAll}
                        className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Flame className="w-3.5 h-3.5" />
                        <span>Send Mass Batch Emails</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleDisconnectWebmailSender}
                      className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
                    >
                      Change Email
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={(e) => handleConnectWebmailSender(e)}
                  className="p-4 bg-slate-950 border border-emerald-500/30 rounded-xl space-y-3"
                >
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-emerald-300">
                      Easiest Option — No Password or Codes Needed
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Just enter your email address below and choose which email app you normally
                      use. synOUT writes the entire legal removal letter for you and opens it
                      ready-to-send in one click.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-6 space-y-1">
                      <label className="block text-xs font-semibold text-slate-300">
                        Your Email Address
                      </label>
                      <input
                        type="email"
                        required
                        value={webmailEmailInput}
                        onChange={(e) => {
                          setWebmailEmailInput(e.target.value);
                          if (e.target.value.includes('@')) {
                            setWebmailLauncher(detectWebmailLauncherFromEmail(e.target.value));
                          }
                        }}
                        placeholder="you@gmail.com"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                      />
                    </div>
                    <div className="md:col-span-3 space-y-1">
                      <label className="block text-xs font-semibold text-slate-300">
                        Open Emails In
                      </label>
                      <select
                        value={webmailLauncher}
                        onChange={(e) => setWebmailLauncher(e.target.value as WebmailLauncherId)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500/60"
                      >
                        <option value="gmail">Gmail (Web)</option>
                        <option value="outlook">Outlook (Web)</option>
                        <option value="yahoo">Yahoo Mail (Web)</option>
                        <option value="mailto">My Default Mail App</option>
                      </select>
                    </div>
                    <div className="md:col-span-3">
                      <button
                        type="submit"
                        className="w-full px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Use This Email</span>
                      </button>
                    </div>
                  </div>
                  {webmailError && <p className="text-xs text-rose-400">{webmailError}</p>}
                </form>
              )}
            </div>
          )}

          {/* Shared Self-Test Verification Confirmation & Receipt Banner (Works for Both SMTP & Google OAuth) */}
          {isAccountConnectedForDirectSend && confirmSelfTest && activeConnectedEmail && (
            <div className="p-3.5 bg-slate-950 border border-emerald-500/40 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <span className="text-slate-200">
                Send a real verification test email to your own inbox (
                <strong className="font-mono text-emerald-400">{activeConnectedEmail}</strong>) now?
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
              const rowContact = resolveBrokerContactProfile(broker, contactOverrides);
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
                    <div className="text-[11px] text-slate-400 font-mono truncate flex items-center gap-1.5">
                      <span className="truncate">{rowContact.effectivePrimaryEmail}</span>
                      {rowContact.hasCustomOverride && (
                        <>
                          <span aria-hidden="true" className="text-slate-600">
                            ·
                          </span>
                          <span className="text-sky-400 font-sans shrink-0">Custom</span>
                        </>
                      )}
                      {rowContact.reroutedFromBounced && (
                        <>
                          <span aria-hidden="true" className="text-slate-600">
                            ·
                          </span>
                          <span className="text-amber-400 font-sans shrink-0">Rerouted</span>
                        </>
                      )}
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
          {activeBroker && activeContact ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
              {/* Target Broker Summary */}
              <div className="space-y-4 pb-6 border-b border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>Recipient Compliance Desk</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          activeContact.requiresPortalWarning
                            ? 'text-amber-400'
                            : activeContact.hasCustomOverride
                            ? 'text-sky-400'
                            : 'text-emerald-400'
                        }
                      >
                        {activeContact.deliverabilityLabel}
                      </span>
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
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span>To: {activeContact.effectivePrimaryEmail}</span>
                      {ccBackupDpo && activeContact.recommendedCcEmails.length > 0 && (
                        <>
                          <span className="text-slate-600">·</span>
                          <span className="text-sky-300">
                            CC: {activeContact.recommendedCcEmails.join(', ')}
                          </span>
                        </>
                      )}
                      {activeSenderEmail && (
                        <>
                          <span className="text-slate-600">·</span>
                          <span className="text-slate-300">From: {activeSenderEmail}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleCheckActiveRecipientMx}
                      disabled={isCheckingMx}
                      className="px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isCheckingMx ? 'animate-spin' : ''}`} />
                      <span>{isCheckingMx ? 'Verifying Inbox...' : 'Verify Inbox'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={
                        isEditingRecipient
                          ? () => setIsEditingRecipient(false)
                          : handleOpenRecipientEditor
                      }
                      className="px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-sky-400" />
                      <span>{isEditingRecipient ? 'Close Editor' : 'Change Recipient'}</span>
                    </button>
                    <a
                      href={activeBroker.optOutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <span>Online Form</span>
                      <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                    </a>
                    <a
                      href={getBrokerRecordSearchUrl(activeBroker, profile)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <Search className="w-3.5 h-3.5 text-sky-400" />
                      <span>Check Listing</span>
                    </a>
                  </div>
                </div>

                {/* Portal-Primary Advisory */}
                {activeContact.requiresPortalWarning && (
                  <div className="p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-200">
                    <div className="space-y-0.5">
                      <span className="font-semibold text-amber-300 block">
                        Tip: Best Removed Using Both Online Form + Email
                      </span>
                      <span className="text-slate-300">
                        {activeBroker.name} uses an online opt-out form alongside its privacy email{' '}
                        <span className="font-mono text-white">
                          {activeContact.effectivePrimaryEmail}
                        </span>
                        . Send this legal email here, and let our{' '}
                        <strong>Online Forms</strong> tool fill &amp; check {activeBroker.name}&apos;s
                        form boxes for you too!
                      </span>
                    </div>
                    <a
                      href={activeBroker.optOutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                    >
                      <span>Open Online Form</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {/* Live DNS MX Deliverability Readout */}
                {mxCheckState && (
                  <div
                    className={`p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      mxCheckState.mxVerified
                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 font-semibold">
                        <span>
                          {mxCheckState.mxVerified
                            ? mxCheckState.usedFallback
                              ? `Primary Address Rejected · Verified Backup Found (${mxCheckState.recommendedEmail})`
                              : `DNS Mail Exchange Verified for ${mxCheckState.recommendedEmail || activeContact.effectivePrimaryEmail}`
                            : 'Recipient Domain Has No Active Mail Exchange (MX) Server'}
                        </span>
                        {mxCheckState.mxHosts.length > 0 && (
                          <>
                            <span aria-hidden="true" className="text-slate-500">
                              ·
                            </span>
                            <span className="font-mono text-[11px] text-slate-300">
                              MX: {mxCheckState.mxHosts.slice(0, 2).join(', ')}
                            </span>
                          </>
                        )}
                      </div>
                      {mxCheckState.reason && (
                        <p className="text-slate-300">{mxCheckState.reason}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {mxCheckState.usedFallback && mxCheckState.recommendedEmail && (
                        <button
                          type="button"
                          onClick={() => handleSaveRecipientOverride(mxCheckState.recommendedEmail!)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-colors cursor-pointer whitespace-nowrap"
                        >
                          Use {mxCheckState.recommendedEmail}
                        </button>
                      )}
                      {!mxCheckState.mxVerified && (
                        <a
                          href={activeBroker.optOutUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <span>Use Official Opt-Out Portal</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Inline Recipient DPO Override & Verified Alias Switcher */}
                {isEditingRecipient && (
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-white">
                        Override Compliance Recipient Email for {activeBroker.name}
                      </span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={handleMarkCurrentRecipientBounced}
                          className="text-amber-400 hover:text-amber-300 font-medium cursor-pointer whitespace-nowrap"
                        >
                          Blacklist Current as Bounced
                        </button>
                        {(activeContact.hasCustomOverride ||
                          activeContact.bouncedEmails.length > 0) && (
                          <button
                            type="button"
                            onClick={handleResetRecipientOverride}
                            className="text-slate-400 hover:text-white inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Reset to Catalog Default</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="email"
                        value={recipientDraft}
                        onChange={(e) => setRecipientDraft(e.target.value)}
                        placeholder="privacy@brokerdomain.com"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500/60"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveRecipientOverride()}
                        className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Save Custom DPO
                      </button>
                    </div>

                    {recipientOverrideError && (
                      <p className="text-xs text-rose-400">{recipientOverrideError}</p>
                    )}

                    {/* Quick-Select Known Compliance & Parent-Entity Desks */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] text-slate-400 block">
                        Known Compliance &amp; Parent-Entity DPO Desks (click to apply):
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {Array.from(
                          new Set(
                            [
                              activeBroker.privacyEmail,
                              ...(activeBroker.fallbackEmails || []),
                            ].filter(Boolean)
                          )
                        ).map((candidate) => {
                          const isCurrent =
                            candidate.toLowerCase() ===
                            activeContact.effectivePrimaryEmail.toLowerCase();
                          const isBounced = activeContact.bouncedEmails.includes(
                            candidate.toLowerCase()
                          );
                          return (
                            <button
                              key={candidate}
                              type="button"
                              onClick={() => handleSaveRecipientOverride(candidate)}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-colors cursor-pointer ${
                                isCurrent
                                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                                  : isBounced
                                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300 line-through'
                                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
                              }`}
                            >
                              {candidate}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
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
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                    <span>{sendErrorMsg}</span>
                  </div>
                  <a
                    href={activeBroker.optOutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 font-semibold inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                  >
                    <span>Open Opt-Out Portal</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* Subject & Body Editor */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Email Subject Line (Pre-Written For You)
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
                      Legal Removal Email (Pre-Written &amp; Ready to Send For You)
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
                          <span>Copy Letter</span>
                        </>
                      )}
                    </button>
                  </div>
                  <textarea
                    rows={11}
                    value={customBody}
                    onChange={(e) => setCustomBody(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-emerald-500/50 resize-y"
                  />
                </div>
              </div>

              {/* Dispatch Controls */}
              <div className="pt-4 border-t border-slate-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {activeContact.recommendedCcEmails.length > 0 && (
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ccBackupDpo}
                        onChange={(e) => setCcBackupDpo(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-950 text-emerald-500"
                      />
                      <span>
                        Also copy backup privacy inbox (
                        <span className="font-mono text-sky-300">
                          {activeContact.recommendedCcEmails.join(', ')}
                        </span>
                        )
                      </span>
                    </label>
                  )}

                  {isAccountConnectedForDirectSend && smtpConnection?.verified && (
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bccSelf}
                        onChange={(e) => setBccSelf(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-950 text-emerald-500"
                      />
                      <span>Send a copy to my own inbox ({activeSenderEmail})</span>
                    </label>
                  )}
                </div>

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
                    {connectionMode === 'webmail' && webmailLinks ? (
                      <a
                        href={
                          webmailSender?.preferredLauncher === 'outlook'
                            ? webmailLinks.outlookUrl
                            : webmailSender?.preferredLauncher === 'yahoo'
                            ? webmailLinks.yahooUrl
                            : webmailSender?.preferredLauncher === 'mailto'
                            ? webmailLinks.mailtoUrl
                            : webmailLinks.gmailUrl
                        }
                        target={webmailSender?.preferredLauncher === 'mailto' ? undefined : '_blank'}
                        rel="noopener noreferrer"
                        onClick={() =>
                          onMarkDispatched(
                            activeBroker.id,
                            `WEB-${(webmailSender?.preferredLauncher || 'GMAIL').toUpperCase()}-${Date.now()
                              .toString(36)
                              .toUpperCase()}`
                          )
                        }
                        className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>
                          Open Pre-Filled Removal Email in{' '}
                          {webmailSender?.preferredLauncher === 'outlook'
                            ? 'Outlook'
                            : webmailSender?.preferredLauncher === 'yahoo'
                            ? 'Yahoo Mail'
                            : webmailSender?.preferredLauncher === 'mailto'
                            ? 'Mail App'
                            : 'Gmail'}
                        </span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={requestSingleSendConfirmation}
                        disabled={isSending || !isAccountConnectedForDirectSend}
                        className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
                      >
                        {isSending ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Sending Removal Email...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            <span>
                              {isAccountConnectedForDirectSend
                                ? `Send Removal Email From ${activeSenderEmail}`
                                : 'Connect Email Above to Auto-Send'}
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
                  synOUT will verify DNS Mail Exchange (MX) records and transmit statutory deletion
                  demands directly from{' '}
                  <strong className="text-emerald-400 font-mono">{activeSenderEmail}</strong>,
                  automatically failing over to verified backup DPO desks if any primary address
                  rejects mail.
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
                {pendingConfirmation.targets.map(({ broker, recipientEmail, ccEmails }) => (
                  <div
                    key={broker.id}
                    className="px-3.5 py-2 flex flex-col gap-0.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-white truncate">{broker.name}</span>
                      <span className="text-emerald-400 font-mono truncate">{recipientEmail}</span>
                    </div>
                    {ccEmails.length > 0 && (
                      <div className="text-[11px] text-slate-400 font-mono truncate">
                        Backup DPO CC: {ccEmails.join(', ')}
                      </div>
                    )}
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
