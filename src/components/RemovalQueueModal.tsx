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
import { startWorkflowClient } from '../services/optOutDiscoveryClient';
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
  Bot,
} from 'lucide-react';

interface RemovalQueueModalProps {
  queue: ScanResult[];
  profile: UserProfile;
  onClose: () => void;
  onBrokerDispatched: (brokerId: string, messageId: string, silent?: boolean) => void;
  onBrokerFormSubmitted?: (params: {
    broker: DataBroker;
    confirmationCode?: string;
    optOutUrl?: string;
    discoveredTitle?: string;
    workflowJobId?: string;
    workflowState?: ScanResult['workflowState'];
    internalSubmissionId?: string;
    brokerConfirmedReceipt?: string | null;
    submissionEvidenceHash?: string;
    verifiedRemoved?: boolean;
  }) => void;
  onComplete: (sentCount: number, senderEmail: string) => void;
  onOpenEmailWorkspace?: () => void;
  onOpenAutomatedNavigator?: (broker: DataBroker, result: ScanResult) => void;
  onOpenWebFormWorkbench?: (broker: DataBroker) => void;
}

interface DeliveryReceiptItem {
  brokerId: string;
  brokerName: string;
  optOutUrl: string;
  recipientEmail: string;
  ccDelivered: string[];
  usedFallback: boolean;
  requiresPortalFollowup: boolean;
  status: 'sent' | 'form_auto_submitted' | 'failed' | 'portal_redirect';
  detail: string;
}

export const RemovalQueueModal: React.FC<RemovalQueueModalProps> = ({
  queue,
  profile,
  onClose,
  onBrokerDispatched,
  onBrokerFormSubmitted,
  onComplete,
  onOpenEmailWorkspace,
  onOpenAutomatedNavigator,
  onOpenWebFormWorkbench,
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
  const [inlineConnectTab, setInlineConnectTab] = useState<'webmail' | 'app_code'>('webmail');

  // Queue & deliverability mitigation options
  const [includeAlreadySent, setIncludeAlreadySent] = useState<boolean>(false);
  const [bccSelf, setBccSelf] = useState<boolean>(false);
  const [ccBackupDpo, setCcBackupDpo] = useState<boolean>(true);
  const [skipPortalPrimary, setSkipPortalPrimary] = useState<boolean>(false);
  const [autoFillFormsFallback, setAutoFillFormsFallback] = useState<boolean>(true);
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

  // Resolved broker targets (includes form-only brokers without email so they auto-fill via form!)
  const allTargets = useMemo(() => {
    return queue
      .map((result) => {
        const broker = findBrokerById(result.brokerId);
        if (!broker) return null;
        const contact = resolveBrokerContactProfile(broker, contactOverrides);
        return { broker, result, contact };
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
      if (!contact.effectivePrimaryEmail) return true;
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
  const [totalWorkItems, setTotalWorkItems] = useState<number>(0);
  const [currentBrokerName, setCurrentBrokerName] = useState<string>('');
  const [currentActionLabel, setCurrentActionLabel] = useState<string>('');
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

    const parts: string[] = [`${verifiedCount} broker inbox(es) verified active`];
    if (reroutedCount > 0) {
      parts.push(`${reroutedCount} inactive address(es) switched to backup privacy inbox`);
    }
    if (portalFallbackCount > 0) {
      parts.push(
        `${portalFallbackCount} site(s) switched to Online Form to prevent bounced mail`
      );
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
      setMxResultsByBroker((prev) => {
        const next = { ...prev };
        delete next[brokerId];
        return next;
      });
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : 'Invalid email override.');
    }
  };

  const executeAutomaticFormFallbackForBroker = async (
    broker: DataBroker,
    recipientEmailHint: string,
    fallbackReason: string
  ): Promise<DeliveryReceiptItem> => {
    try {
      const senderAddr =
        activeConnectedEmail ||
        emailInput ||
        profile.emails.find((e) => Boolean(e && e.trim())) ||
        undefined;
      const job = await startWorkflowClient({
        broker,
        brokerId: broker.id,
        brokerName: broker.name,
        brokerDomain: broker.domain,
        targetUrl: broker.optOutUrl,
        profile,
        senderEmail: senderAddr,
        mode: 'autonomous_auto_submit',
      });

      const isSubmittedState =
        job.state === 'awaiting_broker_processing' ||
        job.state === 'awaiting_email_verification' ||
        job.state === 'submitted_unconfirmed' ||
        job.state === 'removal_verified';

      if (isSubmittedState) {
        onBrokerFormSubmitted?.({
          broker,
          confirmationCode: job.brokerConfirmationCode || undefined,
          optOutUrl: job.currentUrl || broker.optOutUrl,
          discoveredTitle: job.discoveredTitle,
          workflowJobId: job.jobId,
          workflowState: job.state,
          internalSubmissionId: job.internalSubmissionId,
          brokerConfirmedReceipt: job.brokerConfirmationCode,
          submissionEvidenceHash: job.evidence?.evidenceManifestSha256,
          verifiedRemoved: job.state === 'removal_verified',
        });
        return {
          brokerId: broker.id,
          brokerName: broker.name,
          optOutUrl: broker.optOutUrl,
          recipientEmail: recipientEmailHint || broker.optOutUrl,
          ccDelivered: [],
          usedFallback: true,
          requiresPortalFollowup: job.state === 'awaiting_email_verification',
          status: 'form_auto_submitted',
          detail:
            job.state === 'awaiting_email_verification'
              ? 'Form filled & boxes checked · Check email for confirmation link'
              : job.brokerConfirmationCode
              ? `Form filled & boxes checked (${job.brokerConfirmationCode})`
              : 'Form filled, boxes checked & submitted for you',
        };
      }

      return {
        brokerId: broker.id,
        brokerName: broker.name,
        optOutUrl: broker.optOutUrl,
        recipientEmail: recipientEmailHint || broker.optOutUrl,
        ccDelivered: [],
        usedFallback: false,
        requiresPortalFollowup: true,
        status: 'portal_redirect',
        detail: job.blocker?.summary || fallbackReason,
      };
    } catch {
      return {
        brokerId: broker.id,
        brokerName: broker.name,
        optOutUrl: broker.optOutUrl,
        recipientEmail: recipientEmailHint || broker.optOutUrl,
        ccDelivered: [],
        usedFallback: false,
        requiresPortalFollowup: true,
        status: 'portal_redirect',
        detail: fallbackReason,
      };
    }
  };

  const handleAutoRunFormsWithoutEmail = async () => {
    if (candidateTargets.length === 0) return;
    setIsSending(true);
    setDispatchError(null);
    setReceipts([]);
    setTotalWorkItems(candidateTargets.length);

    const collectedReceipts: DeliveryReceiptItem[] = [];
    for (let i = 0; i < candidateTargets.length; i++) {
      const { broker, contact } = candidateTargets[i];
      setCurrentIndex(i + 1);
      setCurrentBrokerName(broker.name);
      setCurrentActionLabel(`Filling online form & checking boxes for ${broker.name}...`);
      const receipt = await executeAutomaticFormFallbackForBroker(
        broker,
        contact.effectivePrimaryEmail,
        'Open online removal form to finish quick security step'
      );
      collectedReceipts.push(receipt);
      setReceipts([...collectedReceipts]);
    }

    setIsSending(false);
    setDispatchFinished(true);
  };

  const handleConfirmAndSendEmails = async () => {
    if (activeTargets.length === 0 && portalOnlyTargets.length > 0 && autoFillFormsFallback) {
      await handleAutoRunFormsWithoutEmail();
      return;
    }
    if (!isDirectSendConnected || !activeConnectedEmail) {
      setDispatchError(
        'Connect your email above to send emails — or click "Auto-Fill Online Forms For Me" so synOUT submits their web forms without email.'
      );
      return;
    }
    if (activeTargets.length === 0 && portalOnlyTargets.length === 0) {
      setDispatchError('No broker targets are queued.');
      return;
    }

    setIsSending(true);
    setDispatchError(null);
    setReceipts([]);
    const totalCount =
      activeTargets.length + (autoFillFormsFallback ? portalOnlyTargets.length : 0);
    setTotalWorkItems(Math.max(1, totalCount));
    let sentCount = 0;
    const collectedReceipts: DeliveryReceiptItem[] = [];
    const senderFullName =
      `${profile.firstName} ${profile.lastName}`.trim() || 'Authorized Consumer';

    for (let i = 0; i < activeTargets.length; i++) {
      const { broker, contact } = activeTargets[i];
      setCurrentIndex(i + 1);
      setCurrentBrokerName(broker.name);
      setCurrentActionLabel(`Sending legal removal email to ${broker.name}...`);

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
        const errMsg = err instanceof Error ? err.message : 'Email delivery unavailable';
        if (autoFillFormsFallback && broker.optOutUrl) {
          setCurrentActionLabel(
            `Email unavailable for ${broker.name} — auto-filling online form & checking boxes...`
          );
          const formReceipt = await executeAutomaticFormFallbackForBroker(
            broker,
            contact.effectivePrimaryEmail,
            errMsg
          );
          collectedReceipts.push(formReceipt);
        } else {
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
      }
      setReceipts([...collectedReceipts]);
    }

    // Automatically fill & check boxes on form-only / dead-MX / portal-preferred brokers!
    for (let j = 0; j < portalOnlyTargets.length; j++) {
      const { broker, contact } = portalOnlyTargets[j];
      const mx = mxResultsByBroker[broker.id];
      if (autoFillFormsFallback && broker.optOutUrl) {
        setCurrentIndex(activeTargets.length + j + 1);
        setCurrentBrokerName(broker.name);
        setCurrentActionLabel(
          `Filling online removal form & checking boxes for ${broker.name}...`
        );
        const formReceipt = await executeAutomaticFormFallbackForBroker(
          broker,
          contact.effectivePrimaryEmail,
          !contact.effectivePrimaryEmail
            ? 'Online form required — open portal to complete'
            : mx && !mx.valid
            ? 'Email inbox inactive — open online form'
            : 'Online form preferred — open portal'
        );
        collectedReceipts.push(formReceipt);
        setReceipts([...collectedReceipts]);
      } else {
        collectedReceipts.push({
          brokerId: broker.id,
          brokerName: broker.name,
          optOutUrl: broker.optOutUrl,
          recipientEmail: contact.effectivePrimaryEmail || broker.optOutUrl,
          ccDelivered: [],
          usedFallback: false,
          requiresPortalFollowup: true,
          status: 'portal_redirect',
          detail:
            mx && !mx.valid
              ? 'Email inbox inactive — complete via official online form'
              : 'Skipped email — complete via official online form',
        });
      }
    }
    setReceipts([...collectedReceipts]);

    setIsSending(false);
    setDispatchFinished(true);

    const autoFormCount = collectedReceipts.filter(
      (r) => r.status === 'form_auto_submitted'
    ).length;
    if (
      sentCount === 0 &&
      autoFormCount === 0 &&
      activeTargets.length > 0 &&
      collectedReceipts.length > 0
    ) {
      setDispatchError(collectedReceipts[0].detail);
    }
  };

  const sentReceiptsCount = receipts.filter((r) => r.status === 'sent').length;
  const formAutoSubmittedCount = receipts.filter((r) => r.status === 'form_auto_submitted').length;
  const failedReceiptsCount = receipts.filter((r) => r.status === 'failed').length;
  const portalRedirectCount = receipts.filter((r) => r.status === 'portal_redirect').length;
  const preset = EMAIL_PROVIDER_PRESETS[provider];
  const isSingleMode = candidateTargets.length === 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="opt-out-dispatch-modal-title"
    >
      <div className="glass-popover rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 my-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/[0.08]">
          <div className="space-y-1">
            <h2
              id="opt-out-dispatch-modal-title"
              className="text-xl font-bold text-white tracking-tight tabular-nums"
            >
              {dispatchFinished
                ? 'Removal Summary (Email & Automatic Forms)'
                : isSingleMode
                ? `Remove Your Record from ${candidateTargets[0]?.broker.name}`
                : `Remove Your Records (${candidateTargets.length} Brokers)`}
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              {dispatchFinished
                ? 'Completed your removal run. Every sent email and auto-submitted form is logged in your Tracker.'
                : 'synOUT writes & sends your legal removal emails for you — and automatically fills out the online removal form (checking required & pop-up boxes) whenever email is not an option.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Single-Broker Online Form Alternative Bar */}
        {!dispatchFinished &&
          !isSending &&
          isSingleMode &&
          candidateTargets[0] &&
          (onOpenAutomatedNavigator || onOpenWebFormWorkbench) && (
            <div className="px-4 py-3 glass-subtle rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <span className="text-slate-300">
                Prefer the online form? Let synOUT fill out{' '}
                <strong className="text-white">{candidateTargets[0].broker.name}</strong>&apos;s
                form &amp; check required consent boxes for you.
              </span>
              <button
                type="button"
                onClick={() => {
                  const target = candidateTargets[0];
                  onClose();
                  if (onOpenAutomatedNavigator) {
                    onOpenAutomatedNavigator(target.broker, target.result);
                  } else if (onOpenWebFormWorkbench) {
                    onOpenWebFormWorkbench(target.broker);
                  }
                }}
                className="px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/35 text-sky-300 font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                <Bot className="w-3.5 h-3.5 text-sky-400" />
                <span>Auto-Fill Online Form Instead</span>
              </button>
            </div>
          )}

        {/* Connected Account Banner OR Inline Connect Form */}
        {!dispatchFinished && (
          <>
            {isDirectSendConnected && activeConnectedEmail ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5 px-4 glass-subtle border-emerald-500/30 rounded-2xl">
                <div className="flex items-center gap-3 min-w-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      Ready to Auto-Send From:{' '}
                      <span className="text-emerald-400 font-mono">{activeConnectedEmail}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {smtp?.verified
                        ? 'Verified background sender · Automatic backup privacy-inbox routing active'
                        : 'Connected via Google Account · Automatic backup privacy-inbox routing active'}
                    </div>
                  </div>
                </div>

                {!isSending && (
                  <button
                    type="button"
                    onClick={handleDisconnectCurrent}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-slate-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Switch Email
                  </button>
                )}
              </div>
            ) : isWebmailConnected && activeConnectedEmail && webmailSender ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5 px-4 glass-subtle border-sky-500/35 rounded-2xl">
                <div className="flex items-center gap-3 min-w-0">
                  <CheckCircle2 className="w-5 h-5 text-sky-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      Ready via 1-Click Webmail:{' '}
                      <span className="text-sky-400 font-mono">{activeConnectedEmail}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Opens your pre-written legal removal email inside{' '}
                      {webmailSender.preferredLauncher.toUpperCase()} — no password needed
                    </div>
                  </div>
                </div>

                {!isSending && (
                  <button
                    type="button"
                    onClick={handleDisconnectCurrent}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-slate-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Change Method
                  </button>
                )}
              </div>
            ) : (
              <div className="p-4 sm:p-5 glass-subtle border-emerald-500/25 rounded-2xl space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-white flex items-center gap-2 tabular-nums">
                      <Mail className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        Simple Email Setup — Or Let synOUT Auto-Fill Online Forms Instead
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Want to send by email? Pick <strong className="text-slate-200">1-Click Webmail</strong>{' '}
                      (easiest — no password needed) or <strong className="text-slate-200">Auto-Send</strong>.
                      Don&apos;t want to connect email? Click{' '}
                      <strong className="text-sky-300">Auto-Fill Online Forms For Me</strong> below and
                      synOUT will fill out the forms &amp; check boxes for you!
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleAutoRunFormsWithoutEmail}
                      disabled={isSending || candidateTargets.length === 0}
                      className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Bot className="w-3.5 h-3.5" />
                      <span>Auto-Fill Online Forms For Me</span>
                    </button>
                    {onOpenEmailWorkspace && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenEmailWorkspace();
                        }}
                        className="text-[11px] text-emerald-400 hover:underline cursor-pointer whitespace-nowrap"
                      >
                        Full Email Page
                      </button>
                    )}
                  </div>
                </div>

                {/* Friendly 2-Way Method Chooser */}
                <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-950/80 border border-white/[0.08] rounded-xl">
                  <button
                    type="button"
                    onClick={() => setInlineConnectTab('webmail')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      inlineConnectTab === 'webmail'
                        ? 'bg-sky-500 text-slate-950 font-bold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    1. 1-Click Webmail (Easiest · No Password)
                  </button>
                  {backendAvailable !== false && (
                    <button
                      type="button"
                      onClick={() => setInlineConnectTab('app_code')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        inlineConnectTab === 'app_code'
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      2. Auto-Send in Background (2-Step App Code)
                    </button>
                  )}
                </div>

                {inlineConnectTab === 'webmail' || backendAvailable === false ? (
                  <div className="space-y-3 pt-1">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Enter your email below. We&apos;ll open your pre-written legal removal email
                      directly inside Gmail, Outlook, Yahoo, or your default mail app — you just
                      click <strong>Send</strong>.
                    </p>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5">
                      <div className="flex-1 space-y-1">
                        <label className="block text-xs font-semibold text-slate-300">
                          Your Email Address
                        </label>
                        <input
                          type="email"
                          value={emailInput}
                          onChange={(e) => handleEmailChange(e.target.value)}
                          placeholder="yourname@email.com"
                          className="w-full glass-input rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleInlineWebmailSignIn}
                        className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Use My Email (No Password)
                      </button>
                      {oauthConfigured && (
                        <button
                          type="button"
                          onClick={handleInlineGoogleOAuth}
                          disabled={isVerifying}
                          className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-xs font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          Sign in with Google
                        </button>
                      )}
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberInBrowser}
                        onChange={(e) => setRememberInBrowser(e.target.checked)}
                        className="rounded border-white/20 bg-slate-950/60 text-sky-500"
                      />
                      <span>Remember my email on this browser</span>
                    </label>
                  </div>
                ) : (
                  <form onSubmit={handleInlineConnect} className="space-y-3 pt-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(Object.keys(EMAIL_PROVIDER_PRESETS) as EmailProviderId[]).map((pid) => (
                        <button
                          key={pid}
                          type="button"
                          onClick={() => setProvider(pid)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                            provider === pid
                              ? 'bg-emerald-500/15 text-white border-emerald-400/50'
                              : 'bg-white/[0.04] text-slate-400 border-white/[0.08] hover:text-slate-200'
                          }`}
                        >
                          {EMAIL_PROVIDER_PRESETS[pid].shortLabel}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-300">
                          Step 1: Your Email Address
                        </label>
                        <input
                          type="email"
                          required
                          value={emailInput}
                          onChange={(e) => handleEmailChange(e.target.value)}
                          placeholder="yourname@email.com"
                          className="w-full glass-input rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <label className="block text-xs font-semibold text-slate-300">
                            Step 2: {preset.credentialLabel}
                          </label>
                          {preset.appPasswordUrl && (
                            <a
                              href={preset.appPasswordUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-emerald-400 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              <span>Get 16-Letter Code</span>
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
                            className="w-full glass-input rounded-xl pl-3 pr-8 py-2 text-xs text-white font-mono placeholder-slate-500"
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
                          className="w-full glass-input rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-500"
                        />
                        <select
                          value={customPort}
                          onChange={(e) => {
                            const p = Number(e.target.value);
                            setCustomPort(p);
                            setCustomSecure(p === 465);
                          }}
                          className="w-full glass-input rounded-xl px-3 py-2 text-xs text-white font-mono"
                        >
                          <option value={587} className="bg-slate-900">
                            Port 587 (STARTTLS)
                          </option>
                          <option value={465} className="bg-slate-900">
                            Port 465 (SSL/TLS)
                          </option>
                          <option value={2525} className="bg-slate-900">
                            Port 2525
                          </option>
                        </select>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rememberInBrowser}
                          onChange={(e) => setRememberInBrowser(e.target.checked)}
                          className="rounded border-white/20 bg-slate-950/60 text-emerald-500"
                        />
                        <span>Keep my email connected on this browser</span>
                      </label>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleInlineWebmailSignIn}
                          className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-sky-300 border border-sky-500/30 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                        >
                          Switch to 1-Click Webmail
                        </button>
                        <button
                          type="submit"
                          disabled={isVerifying}
                          className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          {isVerifying ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Connecting...</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5" />
                              <span>Connect &amp; Auto-Send</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400">{preset.helpText}</p>
                  </form>
                )}

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
                        Use 1-Click Webmail Instead
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
                  className="rounded border-white/20 bg-slate-950/60 text-emerald-500"
                />
                <span>
                  Also re-send to {allTargets.length - unsentTargets.length} broker(s) that already
                  received a verified email
                </span>
              </label>
            )}

            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-300 tabular-nums">
                  Broker Privacy Inboxes ({activeTargets.length} email
                  {portalOnlyTargets.length > 0 ? ` · ${portalOnlyTargets.length} online form` : ''})
                </span>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleVerifyAllMxDeliverability}
                    disabled={isCheckingMx || candidateTargets.length === 0}
                    className="px-2.5 py-1 rounded-lg glass-subtle hover:border-white/20 text-emerald-300 font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    {isCheckingMx ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isCheckingMx ? 'Checking Inboxes...' : 'Verify Broker Inboxes'}
                    </span>
                  </button>

                  {!isSingleMode && (
                    <button
                      type="button"
                      onClick={() => setShowSamplePreview((v) => !v)}
                      className="text-slate-300 hover:text-white inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{showSamplePreview ? 'Hide Email Text' : 'Preview Email Text'}</span>
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

              <div className="max-h-56 overflow-y-auto glass-subtle rounded-2xl divide-y divide-white/[0.07]">
                {candidateTargets.map(({ broker, contact }) => {
                  const mx = mxResultsByBroker[broker.id];
                  const isEditing = editingBrokerId === broker.id;
                  const isSkippedToPortal = portalOnlyTargets.some(
                    (p) => p.broker.id === broker.id
                  );

                  return (
                    <div key={broker.id} className="px-4 py-2.5 space-y-2 text-xs">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-white truncate">{broker.name}</span>
                            <span aria-hidden="true" className="text-slate-600">
                              ·
                            </span>
                            <span
                              className={`text-[11px] ${
                                !contact.effectivePrimaryEmail
                                  ? 'text-sky-300'
                                  : mx && !mx.valid
                                  ? 'text-amber-300'
                                  : contact.hasCustomOverride || contact.reroutedFromBounced
                                  ? 'text-sky-400'
                                  : contact.requiresPortalWarning
                                  ? 'text-amber-300'
                                  : 'text-slate-400'
                              }`}
                            >
                              {!contact.effectivePrimaryEmail
                                ? 'Online Form Only · synOUT Fills Automatically'
                                : mx && !mx.valid
                                ? 'Email Inactive · synOUT Will Auto-Fill Form'
                                : mx?.mxVerified
                                ? 'Inbox Verified'
                                : contact.deliverabilityLabel}
                            </span>
                          </div>

                          <div className="text-[11px] font-mono flex flex-wrap items-center gap-1.5">
                            <span
                              className={
                                isSkippedToPortal && contact.effectivePrimaryEmail
                                  ? 'text-slate-500 line-through'
                                  : 'text-emerald-400'
                              }
                            >
                              {contact.effectivePrimaryEmail || broker.optOutUrl}
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
                          {(contact.requiresPortalWarning || isSkippedToPortal) &&
                            (onOpenAutomatedNavigator || onOpenWebFormWorkbench) && (
                              <button
                                type="button"
                                onClick={() => {
                                  const matchedResult = queue.find(
                                    (q) => q.brokerId === broker.id
                                  );
                                  onClose();
                                  if (onOpenAutomatedNavigator && matchedResult) {
                                    onOpenAutomatedNavigator(broker, matchedResult);
                                  } else if (onOpenWebFormWorkbench) {
                                    onOpenWebFormWorkbench(broker);
                                  }
                                }}
                                className="px-2 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/35 text-sky-300 font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap text-[11px]"
                                title="Let synOUT fill this online form & check required boxes for you"
                              >
                                <Bot className="w-3 h-3 text-sky-400" />
                                <span>Auto-Fill Form</span>
                              </button>
                            )}
                          {contact.requiresPortalWarning && (
                            <a
                              href={broker.optOutUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-amber-300 inline-flex items-center gap-1 whitespace-nowrap text-[11px]"
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
                            className="px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-300 hover:text-white inline-flex items-center gap-1 cursor-pointer whitespace-nowrap text-[11px]"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>{isEditing ? 'Close' : 'Edit'}</span>
                          </button>
                        </div>
                      </div>

                      {isEditing && (
                        <div className="pt-2 border-t border-white/[0.08] space-y-2">
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <input
                              type="email"
                              value={draftCustomEmail}
                              onChange={(e) => setDraftCustomEmail(e.target.value)}
                              placeholder="Enter verified DPO email (e.g. privacy@domain.com)"
                              className="flex-1 glass-input rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
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
                                  className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
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
                                  className="px-2 py-0.5 rounded-md bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] font-mono text-emerald-300 cursor-pointer"
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
                  className="w-full glass-input rounded-xl px-3.5 py-2 text-xs text-white font-mono"
                />
                <textarea
                  rows={6}
                  value={singleBody}
                  onChange={(e) => setSingleBody(e.target.value)}
                  readOnly={!isSingleMode}
                  className="w-full glass-input rounded-xl p-3 text-xs text-slate-300 font-mono leading-relaxed resize-y"
                />
              </div>
            )}

            {/* Automatic Form Fallback + Redundancy Options */}
            <div className="space-y-2 pt-1">
              <label className="flex items-start gap-2.5 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoFillFormsFallback}
                  onChange={(e) => setAutoFillFormsFallback(e.target.checked)}
                  className="mt-0.5 rounded border-white/20 bg-slate-950/60 text-emerald-500"
                />
                <span>
                  <strong className="text-emerald-300">Automatic Online Form Fallback:</strong>{' '}
                  Automatically fill out the online removal form &amp; check required pop-up boxes
                  for me whenever email is not an option
                </span>
              </label>

              <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ccBackupDpo}
                  onChange={(e) => setCcBackupDpo(e.target.checked)}
                  className="mt-0.5 rounded border-white/20 bg-slate-950/60 text-emerald-500"
                />
                <span>
                  Also copy (CC) the parent company&apos;s privacy team when available{' '}
                  <span className="text-slate-500">
                    (helps make sure your email is read faster)
                  </span>
                </span>
              </label>

              {portalPrimaryCount > 0 && (
                <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipPortalPrimary}
                    onChange={(e) => setSkipPortalPrimary(e.target.checked)}
                    className="mt-0.5 rounded border-white/20 bg-slate-950/60 text-emerald-500"
                  />
                  <span>
                    Use online forms directly for {portalPrimaryCount} site(s) that prefer web
                    forms over email
                  </span>
                </label>
              )}

              {isDirectSendConnected && smtp?.verified && (
                <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bccSelf}
                    onChange={(e) => setBccSelf(e.target.checked)}
                    className="mt-0.5 rounded border-white/20 bg-slate-950/60 text-emerald-500"
                  />
                  <span>
                    Send a copy (BCC) of each removal email to{' '}
                    <strong className="font-mono text-white">{activeConnectedEmail}</strong> for my
                    records
                  </span>
                </label>
              )}
            </div>
          </div>
        )}

        {/* Live Progress */}
        {isSending && (
          <div className="p-5 glass-subtle border-emerald-500/30 rounded-2xl space-y-3">
            <div className="flex items-center justify-between text-xs tabular-nums">
              <span className="text-white font-semibold flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                <span>{currentActionLabel || `Working on ${currentBrokerName}...`}</span>
              </span>
              <span className="text-emerald-400 font-mono font-bold">
                {currentIndex} / {Math.max(1, totalWorkItems)}
              </span>
            </div>

            <div className="w-full bg-white/[0.08] h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-400 h-full transition-transform duration-150 origin-left"
                style={{
                  transform: `scaleX(${Math.max(
                    0.04,
                    currentIndex / Math.max(1, totalWorkItems)
                  )})`,
                }}
              />
            </div>

            <p className="text-[11px] text-slate-400">
              synOUT is handling your emails and online removal forms (including checking required
              consent &amp; pop-up boxes) automatically on your behalf.
            </p>
          </div>
        )}

        {/* Delivery Receipts Summary (Post-Send) */}
        {dispatchFinished && (
          <div className="space-y-4">
            <div
              className={`p-4 rounded-2xl border text-xs flex items-start gap-3 ${
                sentReceiptsCount > 0 || formAutoSubmittedCount > 0 || portalRedirectCount > 0
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}
            >
              {sentReceiptsCount > 0 || formAutoSubmittedCount > 0 || portalRedirectCount > 0 ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-bold text-sm text-white tabular-nums">
                  {sentReceiptsCount > 0 && formAutoSubmittedCount > 0
                    ? `Sent ${sentReceiptsCount} Removal Email${sentReceiptsCount === 1 ? '' : 's'} & Auto-Submitted ${formAutoSubmittedCount} Online Form${formAutoSubmittedCount === 1 ? '' : 's'}`
                    : sentReceiptsCount > 0
                    ? `Sent ${sentReceiptsCount} Legal Removal Email${
                        sentReceiptsCount === 1 ? '' : 's'
                      }`
                    : formAutoSubmittedCount > 0
                    ? `Auto-Filled & Submitted ${formAutoSubmittedCount} Online Removal Form${
                        formAutoSubmittedCount === 1 ? '' : 's'
                      }`
                    : portalRedirectCount > 0
                    ? `${portalRedirectCount} Site(s) Ready for Quick Security Check`
                    : 'Could Not Complete Removal Request'}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {sentReceiptsCount > 0 || formAutoSubmittedCount > 0
                    ? 'Your removal requests have been submitted and logged in your Removal Tracker.'
                    : dispatchError ||
                      'A site requested a quick human CAPTCHA check. Click Auto-Fill Form For Me below to finish in one click.'}
                </p>
                {failedReceiptsCount > 0 && (
                  <p className="text-xs text-amber-300">
                    {failedReceiptsCount} site(s) rejected email — click{' '}
                    <strong>Auto-Fill Form For Me</strong> below so synOUT fills out their online
                    form instead.
                  </p>
                )}
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto glass-subtle rounded-2xl divide-y divide-white/[0.07]">
              {receipts.map((item, idx) => (
                <div
                  key={`${item.brokerId}-${idx}`}
                  className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-white truncate">{item.brokerName}</span>
                      {item.status === 'sent' && item.usedFallback && (
                        <span className="text-[11px] text-sky-400">
                          · Sent via backup privacy address
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
                        Email Sent · {item.detail}
                      </span>
                    ) : item.status === 'form_auto_submitted' ? (
                      <span className="text-emerald-400 text-[11px] font-semibold truncate max-w-[230px]">
                        {item.detail}
                      </span>
                    ) : item.status === 'portal_redirect' ? (
                      <span className="text-amber-300 text-[11px]">Needs Quick Check</span>
                    ) : (
                      <span
                        className="text-rose-400 text-[11px] truncate max-w-[170px]"
                        title={item.detail}
                      >
                        Email Rejected · Use Form
                      </span>
                    )}

                    {item.status !== 'sent' &&
                      item.status !== 'form_auto_submitted' &&
                      (onOpenAutomatedNavigator || onOpenWebFormWorkbench) && (
                        <button
                          type="button"
                          onClick={() => {
                            const brokerObj = findBrokerById(item.brokerId);
                            const matchedResult = queue.find((q) => q.brokerId === item.brokerId);
                            if (!brokerObj) return;
                            onClose();
                            if (onOpenAutomatedNavigator && matchedResult) {
                              onOpenAutomatedNavigator(brokerObj, matchedResult);
                            } else if (onOpenWebFormWorkbench) {
                              onOpenWebFormWorkbench(brokerObj);
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap text-[11px]"
                        >
                          <Bot className="w-3 h-3" />
                          <span>Auto-Fill Form For Me</span>
                        </button>
                      )}

                    {item.status !== 'sent' &&
                      item.status !== 'form_auto_submitted' &&
                      item.optOutUrl && (
                        <a
                          href={item.optOutUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-emerald-300 font-semibold inline-flex items-center gap-1 whitespace-nowrap text-[11px]"
                        >
                          <span>Open Form</span>
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
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/[0.08]">
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
                {(sentReceiptsCount > 0 || formAutoSubmittedCount > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      onComplete(
                        sentReceiptsCount + formAutoSubmittedCount,
                        activeConnectedEmail || 'Automatic Form Runner'
                      );
                      onClose();
                    }}
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap"
                  >
                    View Removals in Tracker
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
                ) : activeTargets.length === 0 && portalOnlyTargets.length > 0 ? (
                  <button
                    type="button"
                    onClick={handleAutoRunFormsWithoutEmail}
                    disabled={isSending}
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
                  >
                    <Bot className="w-4 h-4" />
                    <span>
                      {isSending
                        ? 'Filling Forms & Checking Boxes...'
                        : `Auto-Fill & Submit ${portalOnlyTargets.length} Online Form${
                            portalOnlyTargets.length === 1 ? '' : 's'
                          }`}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleConfirmAndSendEmails}
                    disabled={
                      isSending ||
                      !isDirectSendConnected ||
                      (activeTargets.length === 0 && portalOnlyTargets.length === 0)
                    }
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
                  >
                    {isSending ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Working For You...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>
                          {isDirectSendConnected
                            ? activeTargets.length === 1
                              ? 'Confirm & Send Email'
                              : `Confirm & Send ${activeTargets.length} Emails`
                            : 'Connect Email Above (or Use Auto-Fill Forms)'}
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
