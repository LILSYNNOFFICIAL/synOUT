import React, { useState, useMemo, useEffect } from 'react';
import { DataBroker, RemovalWorkflowState, ScanResult, UserProfile } from '../types';
import {
  getExhaustiveBrokerRegistry,
  registerCustomDiscoveredBroker,
} from '../utils/dynamicBrokerRegistry';
import { getBrokerRecordSearchUrl } from '../utils/scanEngine';
import {
  buildStatutoryNoticeForBroker,
  hasVerifiedEmailReceipt,
  sendEmailViaConnectedAccount,
  useEmailConnection,
} from '../services/emailConnectionStore';
import {
  clearBrokerCustomOptOutUrl,
  markBrokerEmailBounced,
  resolveBrokerContactProfile,
  setBrokerCustomOptOutUrl,
  useBrokerContactOverrides,
} from '../utils/brokerContactResolver';
import {
  DEFAULT_DISCLOSURE_POLICY,
  type ConsumerDisclosurePolicy,
  type DiscoveredOptOutCandidate,
  type OptOutDiscoveryReport,
  type OptOutPageInspection,
  buildAutoFillBookmarkletHref,
  buildDisguisedOptOutSearchQueries,
  buildUniversalAutoFillScript,
  classifyBrokerChannelStrategy,
  extractRegistrableDomain,
  hasWebFormSubmission,
  isSafePublicOptOutUrl,
} from '../utils/optOutFormEngine';
import {
  type ClientAutomationCapabilities,
  type ClientRemovalWorkflowJob,
  approveAndSubmitWorkflowClient,
  cancelWorkflowClient,
  completeWorkflowEmailVerificationClient,
  discoverOptOutPagesClient,
  getWorkflowCapabilitiesClient,
  inspectOptOutUrlClient,
  inspectPastedHtmlClient,
  listSessionWorkflowsClient,
  recheckWorkflowRemovalClient,
  recordManualHandoffClient,
  startWorkflowClient,
  submitOptOutWebFormClient,
} from '../services/optOutDiscoveryClient';
import { resolveBrokerPlaybook } from '../utils/brokerAdapterCatalog';
import { copyTextToClipboard } from '../utils/exportEngines';
import {
  Search,
  Globe,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileCode2,
  Bookmark,
  Send,
  Mail,
  RotateCcw,
  Pin,
  Flame,
  Edit3,
  ClipboardCheck,
  Bot,
  ShieldCheck,
  Play,
  Link2,
  XCircle,
} from 'lucide-react';

interface OptOutFormWorkbenchProps {
  profile: UserProfile;
  results: ScanResult[];
  initialBroker?: DataBroker | null;
  onRecordWebFormSubmitted: (params: {
    broker: DataBroker;
    confirmationCode?: string;
    optOutUrl?: string;
    discoveredTitle?: string;
    workflowJobId?: string;
    workflowState?: RemovalWorkflowState;
    internalSubmissionId?: string;
    brokerConfirmedReceipt?: string | null;
    submissionEvidenceHash?: string;
    verifiedRemoved?: boolean;
  }) => void;
  onRecordEmailDispatched: (brokerId: string, messageId: string) => void;
  onOpenConnectEmail: () => void;
  onOpenNukeAll?: () => void;
}

type QueueFilterMode = 'exposed' | 'web_form_primary' | 'all' | 'completed';

function formatWorkflowStateLabel(state: RemovalWorkflowState): string {
  switch (state) {
    case 'queued':
      return 'Queued';
    case 'discovering':
      return 'Discovering Opt-Out Endpoint';
    case 'inspecting':
      return 'Inspecting Live DOM';
    case 'matching_record':
      return 'Matching Person Listing';
    case 'awaiting_user_input':
      return 'Awaiting User Selection / Input';
    case 'ready_to_submit':
      return 'Preview Ready for Approval';
    case 'submitting':
      return 'Submitting Form';
    case 'submitted_unconfirmed':
      return 'Submitted (No Broker Ticket Issued)';
    case 'awaiting_email_verification':
      return 'Awaiting Email Confirmation Link';
    case 'awaiting_broker_processing':
      return 'Submitted · Awaiting Broker Purge';
    case 'removal_verified':
      return 'Removal Verified on Live Site';
    case 'rejected':
      return 'Rejected by Portal';
    case 'blocked':
      return 'Paused for Human Handoff (Anti-Bot / Gate)';
    case 'failed':
      return 'Failed (Validation / Network)';
    case 'cancelled':
      return 'Cancelled';
    default:
      return state;
  }
}

export const OptOutFormWorkbench: React.FC<OptOutFormWorkbenchProps> = ({
  profile,
  results,
  initialBroker,
  onRecordWebFormSubmitted,
  onRecordEmailDispatched,
  onOpenConnectEmail,
  onOpenNukeAll,
}) => {
  const { isDirectSendConnected, activeConnectedEmail } = useEmailConnection();
  const overrides = useBrokerContactOverrides();
  const registry = useMemo(() => getExhaustiveBrokerRegistry(), []);

  // Left-panel queue filtering & ad-hoc custom website support
  const [queueFilter, setQueueFilter] = useState<QueueFilterMode>(
    results.some((r) => r.status === 'exposed') ? 'exposed' : 'web_form_primary'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [adHocBrokers, setAdHocBrokers] = useState<DataBroker[]>([]);
  const [customSiteInput, setCustomSiteInput] = useState('');
  const [customSiteError, setCustomSiteError] = useState<string | null>(null);

  const combinedBrokers = useMemo(() => {
    const map = new Map<string, DataBroker>();
    for (const b of adHocBrokers) map.set(b.id, b);
    for (const b of registry) {
      if (!map.has(b.id)) map.set(b.id, b);
    }
    return Array.from(map.values());
  }, [adHocBrokers, registry]);

  const [selectedBrokerId, setSelectedBrokerId] = useState<string>(() => {
    if (initialBroker) return initialBroker.id;
    const firstExposedForm = results.find((r) => {
      if (r.status !== 'exposed') return false;
      const b = registry.find((x) => x.id === r.brokerId);
      return b?.removalMethod === 'Online Form' || b?.emailDeliverability === 'portal_primary';
    });
    if (firstExposedForm) return firstExposedForm.brokerId;
    const firstExposed = results.find((r) => r.status === 'exposed');
    if (firstExposed) return firstExposed.brokerId;
    return registry[0]?.id || 'spokeo';
  });

  useEffect(() => {
    if (initialBroker) {
      setSelectedBrokerId(initialBroker.id);
    }
  }, [initialBroker]);

  const activeBroker = useMemo(
    () => combinedBrokers.find((b) => b.id === selectedBrokerId) || combinedBrokers[0],
    [combinedBrokers, selectedBrokerId]
  );

  const activeScanResult = useMemo(
    () => (activeBroker ? results.find((r) => r.brokerId === activeBroker.id) : undefined),
    [results, activeBroker]
  );

  const contact = useMemo(
    () => (activeBroker ? resolveBrokerContactProfile(activeBroker, overrides) : null),
    [activeBroker, overrides]
  );

  // Autonomous Headless Browser Workflow Runner state
  const [capabilities, setCapabilities] = useState<ClientAutomationCapabilities | null>(null);
  const [workflowJobsByBroker, setWorkflowJobsByBroker] = useState<
    Record<string, ClientRemovalWorkflowJob>
  >({});
  const [isWorkflowBusy, setIsWorkflowBusy] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [disclosurePolicy, setDisclosurePolicy] = useState<ConsumerDisclosurePolicy>(
    DEFAULT_DISCLOSURE_POLICY
  );
  const [liveFieldOverrides, setLiveFieldOverrides] = useState<Record<string, string>>({});
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [verificationLinkInput, setVerificationLinkInput] = useState('');
  const [handoffTicketInput, setHandoffTicketInput] = useState('');
  const [handoffNeedsEmailVerify, setHandoffNeedsEmailVerify] = useState(false);
  const [showTraceLog, setShowTraceLog] = useState(false);

  // Discovery & Form Inspection state per broker
  const [isCrawling, setIsCrawling] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discoveryReport, setDiscoveryReport] = useState<OptOutDiscoveryReport | null>(null);
  const [activeInspection, setActiveInspection] = useState<OptOutPageInspection | null>(null);

  // Editable Form Field Values (key -> value)
  const [editedFieldValues, setEditedFieldValues] = useState<Record<string, string>>({});

  // Custom Opt-Out URL editor
  const [isEditingOptOutUrl, setIsEditingOptOutUrl] = useState(false);
  const [draftOptOutUrl, setDraftOptOutUrl] = useState('');
  const [draftOptOutTitle, setDraftOptOutTitle] = useState('');

  // Offline / Cloudflare Raw HTML Paste Analyzer
  const [showHtmlPasteDrawer, setShowHtmlPasteDrawer] = useState(false);
  const [pastedRawHtml, setPastedRawHtml] = useState('');

  // Relay Submission & Ticket Logging state
  const [isSubmittingRelay, setIsSubmittingRelay] = useState(false);
  const [relayFeedback, setRelayFeedback] = useState<{
    ok: boolean;
    message: string;
    ticket?: string;
    internalId?: string;
    requiresCaptcha?: boolean;
  } | null>(null);
  const [manualTicketInput, setManualTicketInput] = useState('');

  // Dual-Channel Email Send state
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Clipboard indicators
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Load automation capabilities & existing session jobs on mount
  useEffect(() => {
    void getWorkflowCapabilitiesClient().then(setCapabilities);
    void listSessionWorkflowsClient().then((jobs) => {
      if (jobs.length === 0) return;
      const map: Record<string, ClientRemovalWorkflowJob> = {};
      for (const j of jobs) {
        if (!map[j.brokerId]) {
          map[j.brokerId] = j;
        }
      }
      setWorkflowJobsByBroker(map);
    });
  }, []);

  const activeWorkflowJob = activeBroker ? workflowJobsByBroker[activeBroker.id] || null : null;

  // Sync live field overrides & candidate selection whenever active workflow job updates
  useEffect(() => {
    if (!activeWorkflowJob) {
      setLiveFieldOverrides({});
      setSelectedCandidateId('');
      return;
    }
    const nextOverrides: Record<string, string> = {};
    for (const f of activeWorkflowJob.mappedFields) {
      if (!f.preserveOriginalHidden && f.disclosureAllowed) {
        nextOverrides[f.fieldKey] = f.plannedValue;
      }
    }
    setLiveFieldOverrides(nextOverrides);
    if (activeWorkflowJob.selectedCandidateId) {
      setSelectedCandidateId(activeWorkflowJob.selectedCandidateId);
    } else {
      const firstEligible = activeWorkflowJob.candidateRecords.find((c) => !c.disqualifiedHomonym);
      setSelectedCandidateId(firstEligible?.candidateId || '');
    }
  }, [activeWorkflowJob?.jobId, activeWorkflowJob?.updatedAtIso]);

  // Reset transient discovery views when switching active broker
  useEffect(() => {
    setDiscoveryReport(null);
    setActiveInspection(null);
    setDiscoveryError(null);
    setWorkflowError(null);
    setRelayFeedback(null);
    setEmailFeedback(null);
    setEditedFieldValues({});
    setVerificationLinkInput('');
    setHandoffTicketInput('');
    setManualTicketInput(activeScanResult?.brokerConfirmedReceipt || '');
    setIsEditingOptOutUrl(false);
  }, [activeBroker?.id, activeScanResult?.brokerConfirmedReceipt]);

  // Seed editable form values whenever a new static form inspection arrives
  useEffect(() => {
    const primaryForm = activeInspection?.forms[0];
    if (!primaryForm) {
      setEditedFieldValues({});
      return;
    }
    const nextMap: Record<string, string> = {};
    for (const field of primaryForm.fields) {
      nextMap[field.name] = field.suggestedValue;
    }
    setEditedFieldValues(nextMap);
  }, [activeInspection]);

  const senderEmail = activeConnectedEmail || profile.emails[0] || '';

  const syncJobToParentState = (job: ClientRemovalWorkflowJob, brokerTarget: DataBroker) => {
    setWorkflowJobsByBroker((prev) => ({ ...prev, [brokerTarget.id]: job }));

    const isSubmittedState =
      job.state === 'awaiting_broker_processing' ||
      job.state === 'awaiting_email_verification' ||
      job.state === 'submitted_unconfirmed' ||
      job.state === 'removal_verified';

    if (isSubmittedState) {
      onRecordWebFormSubmitted({
        broker: brokerTarget,
        confirmationCode: job.brokerConfirmationCode || undefined,
        optOutUrl: job.currentUrl || job.targetUrl,
        discoveredTitle: job.discoveredTitle || undefined,
        workflowJobId: job.jobId,
        workflowState: job.state,
        internalSubmissionId: job.internalSubmissionId,
        brokerConfirmedReceipt: job.brokerConfirmationCode,
        submissionEvidenceHash: job.evidence?.evidenceManifestSha256,
        verifiedRemoved: job.state === 'removal_verified',
      });
    }
  };

  const handleRunHeadlessWorkflow = async (
    mode: 'inspect_and_preview' | 'autonomous_auto_submit'
  ) => {
    if (!activeBroker || !contact) return;
    setIsWorkflowBusy(true);
    setWorkflowError(null);
    try {
      const job = await startWorkflowClient({
        broker: activeBroker,
        brokerId: activeBroker.id,
        brokerName: activeBroker.name,
        brokerDomain: activeBroker.domain,
        targetUrl: contact.optOutUrl,
        profile,
        senderEmail: senderEmail || undefined,
        mode,
        disclosurePolicy,
      });
      syncJobToParentState(job, activeBroker);
    } catch (err) {
      setWorkflowError(
        err instanceof Error ? err.message : 'Failed executing headless opt-out workflow.'
      );
    } finally {
      setIsWorkflowBusy(false);
    }
  };

  const handleApproveAndSubmitWorkflow = async () => {
    if (!activeBroker || !activeWorkflowJob) return;
    setIsWorkflowBusy(true);
    setWorkflowError(null);
    try {
      const job = await approveAndSubmitWorkflowClient({
        jobId: activeWorkflowJob.jobId,
        fieldOverrides: liveFieldOverrides,
        disclosurePolicy,
        selectedCandidateId: selectedCandidateId || undefined,
      });
      syncJobToParentState(job, activeBroker);
    } catch (err) {
      setWorkflowError(
        err instanceof Error ? err.message : 'Failed submitting approved opt-out form.'
      );
    } finally {
      setIsWorkflowBusy(false);
    }
  };

  const handleCompleteEmailVerification = async () => {
    if (!activeBroker || !activeWorkflowJob || !verificationLinkInput.trim()) return;
    setIsWorkflowBusy(true);
    setWorkflowError(null);
    try {
      const job = await completeWorkflowEmailVerificationClient({
        jobId: activeWorkflowJob.jobId,
        verificationUrl: verificationLinkInput.trim(),
      });
      syncJobToParentState(job, activeBroker);
      setVerificationLinkInput('');
    } catch (err) {
      setWorkflowError(
        err instanceof Error ? err.message : 'Inbound email verification link failed.'
      );
    } finally {
      setIsWorkflowBusy(false);
    }
  };

  const handleRecheckListingRemoval = async () => {
    if (!activeBroker || !activeWorkflowJob) return;
    setIsWorkflowBusy(true);
    setWorkflowError(null);
    try {
      const job = await recheckWorkflowRemovalClient({
        jobId: activeWorkflowJob.jobId,
      });
      syncJobToParentState(job, activeBroker);
    } catch (err) {
      setWorkflowError(
        err instanceof Error ? err.message : 'Live listing removal re-check failed.'
      );
    } finally {
      setIsWorkflowBusy(false);
    }
  };

  const handleRecordManualHandoff = async () => {
    if (!activeBroker || !activeWorkflowJob) return;
    setIsWorkflowBusy(true);
    setWorkflowError(null);
    try {
      const job = await recordManualHandoffClient({
        jobId: activeWorkflowJob.jobId,
        userProvidedConfirmationCode: handoffTicketInput.trim() || undefined,
        requiresEmailVerification: handoffNeedsEmailVerify,
      });
      syncJobToParentState(job, activeBroker);
      setHandoffTicketInput('');
    } catch (err) {
      setWorkflowError(
        err instanceof Error ? err.message : 'Could not record manual browser handoff.'
      );
    } finally {
      setIsWorkflowBusy(false);
    }
  };

  const handleCancelWorkflow = async () => {
    if (!activeBroker || !activeWorkflowJob) return;
    setIsWorkflowBusy(true);
    setWorkflowError(null);
    try {
      const job = await cancelWorkflowClient(activeWorkflowJob.jobId);
      setWorkflowJobsByBroker((prev) => ({ ...prev, [activeBroker.id]: job }));
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : 'Could not cancel workflow.');
    } finally {
      setIsWorkflowBusy(false);
    }
  };

  const filteredQueue = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return combinedBrokers.filter((b) => {
      const scanItem = results.find((r) => r.brokerId === b.id);
      const isExposed = scanItem?.status === 'exposed' || b.id.startsWith('custom-site-');
      const formDone = scanItem ? hasWebFormSubmission(scanItem) : false;
      const emailDone = scanItem ? hasVerifiedEmailReceipt(scanItem) : false;
      const isWebFormPrimary =
        b.removalMethod === 'Online Form' ||
        b.emailDeliverability === 'portal_primary' ||
        !b.privacyEmail;

      if (queueFilter === 'exposed' && !isExposed) return false;
      if (queueFilter === 'web_form_primary' && !isWebFormPrimary) return false;
      if (
        queueFilter === 'completed' &&
        !formDone &&
        !emailDone &&
        scanItem?.removalStatus !== 'removed'
      ) {
        return false;
      }

      if (!q) return true;
      const c = resolveBrokerContactProfile(b, overrides);
      return (
        b.name.toLowerCase().includes(q) ||
        b.domain.toLowerCase().includes(q) ||
        b.removalMethod.toLowerCase().includes(q) ||
        (c.discoveredOptOutTitle && c.discoveredOptOutTitle.toLowerCase().includes(q))
      );
    });
  }, [combinedBrokers, results, queueFilter, searchQuery, overrides]);

  const markCopied = (key: string, text: string) => {
    void copyTextToClipboard(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleAddAndCrawlCustomSite = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomSiteError(null);
    const check = isSafePublicOptOutUrl(customSiteInput);
    if (!check.valid) {
      setCustomSiteError(check.reason || 'Enter a valid public website domain or URL.');
      return;
    }

    const regDomain = extractRegistrableDomain(check.hostname);
    const existing = combinedBrokers.find(
      (b) => extractRegistrableDomain(b.domain) === regDomain
    );

    let targetBroker: DataBroker;
    if (existing) {
      targetBroker = existing;
    } else {
      const labelName = regDomain
        .split('.')[0]
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (ch) => ch.toUpperCase());
      targetBroker = {
        id: `custom-site-${regDomain.replace(/[^a-z0-9]/gi, '-')}`,
        name: `${labelName} (${regDomain})`,
        domain: regDomain,
        category: 'People Search',
        risk: 'High',
        optOutUrl: check.normalizedUrl,
        recordsUrl: `https://${regDomain}`,
        privacyEmail: `privacy@${regDomain}`,
        emailDeliverability: 'portal_primary',
        removalMethod: 'Online Form',
        removalTime: '7–45 days',
        dataExposedList: ['Name', 'Address', 'Phone', 'Public Profile'],
        overview: `User-added website (${regDomain}) queued for opt-out page discovery and web-form suppression.`,
        instructions: [
          `Crawl ${regDomain} to uncover its opt-out or "Your Privacy Choices" form regardless of page title.`,
          'Run the Autonomous Headless Browser Runner or 1-Click Auto-Fill Bookmarklet.',
          'Save any genuine broker confirmation code and optionally send a statutory CCPA email notice.',
        ],
        exposureLikelihood: 0.75,
        provenanceSource: 'user_custom_discovered',
      };
      registerCustomDiscoveredBroker(targetBroker);
      setAdHocBrokers((prev) => [targetBroker, ...prev.filter((b) => b.id !== targetBroker.id)]);
    }

    setSelectedBrokerId(targetBroker.id);
    setCustomSiteInput('');
    await runDomainDiscovery(targetBroker, check.normalizedUrl);
  };

  const runDomainDiscovery = async (brokerTarget: DataBroker, explicitUrl?: string) => {
    setIsCrawling(true);
    setDiscoveryError(null);
    setRelayFeedback(null);

    try {
      const currentContact = resolveBrokerContactProfile(brokerTarget, overrides);
      const report = await discoverOptOutPagesClient({
        domainOrUrl: explicitUrl || brokerTarget.domain,
        knownOptOutUrl: currentContact.optOutUrl,
        profile,
        senderEmail,
        broker: brokerTarget,
      });
      setDiscoveryReport(report);
      if (report.bestInspection) {
        setActiveInspection(report.bestInspection);
      }
    } catch (err) {
      setDiscoveryError(
        err instanceof Error ? err.message : 'Could not scan domain for opt-out pages.'
      );
    } finally {
      setIsCrawling(false);
    }
  };

  const handleInspectCandidateUrl = async (targetUrl: string) => {
    if (!activeBroker) return;
    setIsInspecting(true);
    setDiscoveryError(null);
    setRelayFeedback(null);
    try {
      const inspection = await inspectOptOutUrlClient({
        url: targetUrl,
        profile,
        senderEmail,
        broker: activeBroker,
      });
      setActiveInspection(inspection);
    } catch (err) {
      setDiscoveryError(err instanceof Error ? err.message : 'Failed inspecting opt-out form.');
    } finally {
      setIsInspecting(false);
    }
  };

  const handlePinCandidateOptOutUrl = (cand: DiscoveredOptOutCandidate) => {
    if (!activeBroker) return;
    try {
      setBrokerCustomOptOutUrl(
        activeBroker.id,
        cand.url,
        cand.pageTitle || cand.anchorText,
        cand.mappedFieldCount
      );
    } catch (err) {
      setDiscoveryError(err instanceof Error ? err.message : 'Invalid opt-out URL.');
    }
  };

  const handleSaveManualOptOutUrl = () => {
    if (!activeBroker) return;
    try {
      setBrokerCustomOptOutUrl(
        activeBroker.id,
        draftOptOutUrl,
        draftOptOutTitle || undefined
      );
      setIsEditingOptOutUrl(false);
      setDiscoveryError(null);
    } catch (err) {
      setDiscoveryError(err instanceof Error ? err.message : 'Enter a valid https:// URL.');
    }
  };

  const handleAnalyzePastedHtml = () => {
    if (!activeBroker || !contact) return;
    setDiscoveryError(null);
    try {
      const parsed = inspectPastedHtmlClient({
        rawHtml: pastedRawHtml,
        pageUrl: contact.optOutUrl,
        profile,
        senderEmail,
        broker: activeBroker,
      });
      setActiveInspection(parsed);
      setShowHtmlPasteDrawer(false);
    } catch (err) {
      setDiscoveryError(err instanceof Error ? err.message : 'Could not parse HTML snippet.');
    }
  };

  const handleDirectFormRelaySubmit = async () => {
    const primaryForm = activeInspection?.forms[0];
    if (!activeBroker || !primaryForm) return;

    setIsSubmittingRelay(true);
    setRelayFeedback(null);

    try {
      const response = await submitOptOutWebFormClient({
        actionUrl: primaryForm.actionUrl,
        method: primaryForm.method,
        fields: editedFieldValues,
        refererUrl: activeInspection?.finalUrl || contact?.optOutUrl,
        brokerId: activeBroker.id,
        brokerName: activeBroker.name,
        brokerDomain: activeBroker.domain,
      });

      if (response.success) {
        const brokerCode = response.brokerConfirmationCode;
        setRelayFeedback({
          ok: true,
          message: brokerCode
            ? `Form accepted (${primaryForm.method} -> HTTP ${response.httpStatus}). Broker Confirmation Code: ${brokerCode} · Internal Audit ID: ${response.internalSubmissionId}.`
            : `Form transmitted (${primaryForm.method} -> HTTP ${response.httpStatus}) with Sec-GPC: 1. No confirmation ticket was issued by ${activeBroker.name}; tracked under Internal Audit ID ${response.internalSubmissionId}.`,
          ticket: brokerCode || undefined,
          internalId: response.internalSubmissionId,
        });
        if (brokerCode) {
          setManualTicketInput(brokerCode);
        }
        onRecordWebFormSubmitted({
          broker: activeBroker,
          confirmationCode: brokerCode || undefined,
          optOutUrl: activeInspection?.finalUrl || contact?.optOutUrl,
          discoveredTitle: activeInspection?.pageTitle,
          workflowState:
            response.outcomeClassification === 'awaiting_email_verification'
              ? 'awaiting_email_verification'
              : response.outcomeClassification === 'awaiting_broker_processing'
              ? 'awaiting_broker_processing'
              : 'submitted_unconfirmed',
          internalSubmissionId: response.internalSubmissionId,
          brokerConfirmedReceipt: brokerCode,
        });
      } else {
        setRelayFeedback({
          ok: false,
          requiresCaptcha: response.requiresBrowserCaptcha,
          message: response.requiresBrowserCaptcha
            ? `Broker returned HTTP ${response.httpStatus} (${response.antiBotGate}) requiring interactive human verification. Open the opt-out page in your browser, run the synOUT Auto-Fill Bookmarklet, complete the CAPTCHA, and log your submission below.`
            : response.outcomeSummary ||
              `Portal returned HTTP ${response.httpStatus} (${response.outcomeClassification || 'rejected'}). Use the Autonomous Headless Browser Runner above or open the page with the Bookmarklet.`,
        });
      }
    } catch (err) {
      setRelayFeedback({
        ok: false,
        message:
          err instanceof Error
            ? err.message
            : 'Direct form relay unavailable; use the Autonomous Browser Runner or 1-Click Bookmarklet.',
      });
    } finally {
      setIsSubmittingRelay(false);
    }
  };

  const handleLogCompletedWebForm = () => {
    if (!activeBroker || !contact) return;
    const trimmedTicket = manualTicketInput.trim();

    onRecordWebFormSubmitted({
      broker: activeBroker,
      confirmationCode: trimmedTicket || undefined,
      optOutUrl: activeInspection?.finalUrl || contact.optOutUrl,
      discoveredTitle: activeInspection?.pageTitle || contact.discoveredOptOutTitle,
      workflowState: trimmedTicket ? 'awaiting_broker_processing' : 'submitted_unconfirmed',
      brokerConfirmedReceipt: trimmedTicket || null,
    });
  };

  const handleSendCompanionEmail = async () => {
    if (!activeBroker || !contact?.effectivePrimaryEmail) return;
    setIsSendingEmail(true);
    setEmailFeedback(null);
    try {
      const draft = buildStatutoryNoticeForBroker(activeBroker, profile, senderEmail || undefined);
      const receipt = await sendEmailViaConnectedAccount({
        recipientEmail: contact.effectivePrimaryEmail,
        fallbackRecipientEmails: contact.fallbackEmails,
        ccEmails: contact.recommendedCcEmails,
        subject: draft.subject,
        body: draft.body,
        senderName: `${profile.firstName} ${profile.lastName}`.trim() || 'Authorized Consumer',
        brokerId: activeBroker.id,
        brokerName: activeBroker.name,
        brokerDomain: activeBroker.domain,
        bccSelf: true,
      });
      if (receipt.usedFallback) {
        markBrokerEmailBounced(activeBroker.id, contact.effectivePrimaryEmail);
      }
      onRecordEmailDispatched(activeBroker.id, receipt.messageId);
      setEmailFeedback({
        ok: true,
        text: `Statutory CCPA email sent to ${receipt.deliveredTo} · Receipt: ${receipt.messageId}`,
      });
    } catch (err) {
      setEmailFeedback({
        ok: false,
        text: err instanceof Error ? err.message : 'Failed sending statutory email.',
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const autoFillScript = useMemo(
    () =>
      activeBroker
        ? buildUniversalAutoFillScript(profile, senderEmail, activeBroker, disclosurePolicy)
        : '',
    [profile, senderEmail, activeBroker, disclosurePolicy]
  );

  const bookmarkletHref = useMemo(
    () =>
      activeBroker
        ? buildAutoFillBookmarkletHref(profile, senderEmail, activeBroker, disclosurePolicy)
        : '',
    [profile, senderEmail, activeBroker, disclosurePolicy]
  );

  const searchDorks = useMemo(
    () =>
      activeBroker ? buildDisguisedOptOutSearchQueries(activeBroker.domain) : [],
    [activeBroker]
  );

  const channelStrategy = useMemo(
    () => (activeBroker ? classifyBrokerChannelStrategy(activeBroker) : null),
    [activeBroker]
  );

  const webFormCompletedCount = useMemo(
    () => results.filter((r) => hasWebFormSubmission(r) || r.removalStatus === 'removed').length,
    [results]
  );

  const webFormPrimaryCatalogCount = useMemo(
    () =>
      combinedBrokers.filter(
        (b) => b.removalMethod === 'Online Form' || b.emailDeliverability === 'portal_primary'
      ).length,
    [combinedBrokers]
  );

  if (!activeBroker || !contact) {
    return null;
  }

  const activePlaybook = useMemo(
    () => (activeBroker ? resolveBrokerPlaybook(activeBroker.domain) : null),
    [activeBroker]
  );

  const recordSearchUrl = getBrokerRecordSearchUrl(activeBroker, profile);
  const isFormLogged = activeScanResult ? hasWebFormSubmission(activeScanResult) : false;
  const isEmailSent = activeScanResult ? hasVerifiedEmailReceipt(activeScanResult) : false;
  const primaryForm = activeInspection?.forms[0] || null;
  const visibleFormFields =
    primaryForm?.fields.filter((f) => f.semanticRole !== 'csrf_or_hidden') || [];

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-6">
      {activePlaybook && (
        <div className="glass-panel rounded-2xl p-5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2 text-slate-300">
              <Bot className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-semibold text-white">
                Dedicated Multi-Step Playbook Active: {activePlaybook.brokerName}
              </span>
              {activePlaybook.networkGroup && (
                <>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-emerald-300">{activePlaybook.networkGroup}</span>
                </>
              )}
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              {activePlaybook.requiresEmailVerificationLink
                ? 'Requires Email Confirmation Link (Auto-Supported in Inbox Harvester)'
                : 'Direct Suppression Portal'}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px] text-slate-300">
            {activePlaybook.stepsSummary.map((stepText, idx) => (
              <div key={idx} className="glass-subtle rounded-xl px-3 py-2">
                <span className="font-mono text-emerald-400 mr-1.5">0{idx + 1}.</span>
                <span>{stepText}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Top Workbench Header */}
      <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400 tabular-nums">
              <span className="text-emerald-400 font-semibold">
                Autonomous Headless Browser + Bookmarklet Opt-Out Engine
              </span>
              <span aria-hidden="true">·</span>
              <span>{webFormPrimaryCatalogCount} Portal-Primary Brokers</span>
              <span aria-hidden="true">·</span>
              <span>{webFormCompletedCount} Forms Tracked</span>
              {capabilities && (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      capabilities.headlessBrowserAvailable ? 'text-sky-400' : 'text-amber-400'
                    }
                  >
                    {capabilities.headlessBrowserAvailable
                      ? `Chromium Worker Ready (${capabilities.workerMode})`
                      : 'Static Mode (Bookmarklet Fallback)'}
                  </span>
                </>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              Autonomous Opt-Out Web Form Runner &amp; Page Discovery Workbench
            </h1>
            <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
              Many data brokers require locating a profile, navigating multi-step JavaScript portals
              (<em>&ldquo;Your Privacy Choices&rdquo;</em>, <em>&ldquo;Do Not Sell or Share&rdquo;</em>,
              OneTrust DSARs), filling suppression forms, and clicking email confirmation links.
              Launch a real headless Chromium session to inspect, match, populate, submit, and
              re-verify removal — with clean human handoff whenever a CAPTCHA gate appears.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <a
              ref={(el) => {
                if (el && bookmarkletHref) {
                  el.setAttribute('href', bookmarkletHref);
                }
              }}
              onClick={(e) => {
                e.preventDefault();
                markCopied('header-bookmarklet', autoFillScript);
              }}
              title="Drag this button to your browser Bookmarks Bar, then click it on ANY broker opt-out page to auto-fill all fields"
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-2 transition-colors cursor-grab whitespace-nowrap"
            >
              <Bookmark className="w-4 h-4" />
              <span>
                {copiedKey === 'header-bookmarklet'
                  ? 'Auto-Fill Script Copied'
                  : 'synOUT Auto-Fill Bookmarklet'}
              </span>
            </a>

            {onOpenNukeAll && (
              <button
                type="button"
                onClick={onOpenNukeAll}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white border border-red-400/30 text-xs font-extrabold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Flame className="w-4 h-4" />
                <span>NUKE ALL</span>
              </button>
            )}
          </div>
        </div>

        {/* Custom Any-Website Opt-Out Page & Form Scanner */}
        <form
          onSubmit={handleAddAndCrawlCustomSite}
          className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 text-xs"
        >
          <div className="flex-1 flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 focus-within:border-emerald-500/60">
            <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
            <input
              type="text"
              value={customSiteInput}
              onChange={(e) => setCustomSiteInput(e.target.value)}
              placeholder="Enter ANY broker domain or website URL (e.g. spokeo.com, clustrmaps.com, unknownbroker.com)..."
              className="w-full bg-transparent text-white placeholder-slate-500 focus:outline-none font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={isCrawling || !customSiteInput.trim()}
            className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-extrabold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            {isCrawling ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            <span>Find Hidden Opt-Out Page &amp; Form</span>
          </button>
        </form>
        {customSiteError && (
          <p className="text-xs text-rose-400 font-medium">{customSiteError}</p>
        )}
      </div>

      {/* Main Two-Column Workbench Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Broker & Portal Selector Queue */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl text-[11px]">
            {(
              [
                ['exposed', 'Exposed'],
                ['web_form_primary', 'Form Primary'],
                ['all', `All (${combinedBrokers.length})`],
                ['completed', 'Submitted'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setQueueFilter(mode)}
                className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                  queueFilter === mode
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter brokers or domains..."
              className="w-full bg-transparent text-white placeholder-slate-500 focus:outline-none"
            />
          </div>

          <div className="text-[11px] text-slate-500 font-mono flex items-center justify-between px-1 tabular-nums">
            <span>Showing {filteredQueue.length} brokers</span>
            <span>Select portal</span>
          </div>

          <div className="max-h-[640px] overflow-y-auto divide-y divide-slate-800/70 border border-slate-800 rounded-xl bg-slate-950">
            {filteredQueue.length === 0 ? (
              <div className="p-6 text-center space-y-2 text-xs text-slate-400">
                <p>No brokers match this filter.</p>
                <button
                  type="button"
                  onClick={() => {
                    setQueueFilter('all');
                    setSearchQuery('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold cursor-pointer"
                >
                  Show All {combinedBrokers.length} Brokers
                </button>
              </div>
            ) : (
              filteredQueue.slice(0, 160).map((b) => {
                const r = results.find((x) => x.brokerId === b.id);
                const wfJob = workflowJobsByBroker[b.id];
                const formDone = r ? hasWebFormSubmission(r) : false;
                const mailDone = r ? hasVerifiedEmailReceipt(r) : false;
                const strat = classifyBrokerChannelStrategy(b);
                const c = resolveBrokerContactProfile(b, overrides);
                const isSelected = b.id === activeBroker.id;

                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBrokerId(b.id)}
                    className={`w-full text-left p-3.5 transition-colors cursor-pointer space-y-1 ${
                      isSelected ? 'bg-slate-800/90' : 'hover:bg-slate-900/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white truncate">{b.name}</span>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {strat.shortBadge}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-500">
                      <span className="truncate">{b.domain}</span>
                      <span className="shrink-0">
                        {r?.removalStatus === 'removed' || wfJob?.state === 'removal_verified' ? (
                          <span className="text-emerald-400">Verified Removed</span>
                        ) : wfJob?.state === 'blocked' ? (
                          <span className="text-amber-400">Handoff Needed</span>
                        ) : wfJob?.state === 'awaiting_email_verification' ? (
                          <span className="text-sky-400">Verify Email</span>
                        ) : formDone && mailDone ? (
                          <span className="text-emerald-400">Form + Email</span>
                        ) : formDone ? (
                          <span className="text-sky-400">Form Submitted</span>
                        ) : mailDone ? (
                          <span className="text-emerald-300">Email Sent</span>
                        ) : (
                          <span>Pending</span>
                        )}
                      </span>
                    </div>
                    {c.discoveredOptOutTitle && (
                      <div className="text-[10px] text-emerald-300/90 truncate">
                        Title: {c.discoveredOptOutTitle}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Autonomous Browser Runner, Opt-Out Spider, Field Mapper & Dual-Channel Actions */}
        <div className="lg:col-span-8 space-y-6">
          {/* Section 1: Active Broker Overview & Opt-Out Endpoint Controls */}
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400">
                  <span className="text-emerald-400 font-semibold">
                    {channelStrategy?.shortBadge || activeBroker.removalMethod}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{activeBroker.domain}</span>
                  <span aria-hidden="true">·</span>
                  <span>SLA Window: {activeBroker.removalTime}</span>
                  {activeBroker.adapterId && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-500">Adapter: {activeBroker.adapterId}</span>
                    </>
                  )}
                </div>
                <h2 className="text-xl font-extrabold text-white">{activeBroker.name}</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {channelStrategy?.explanation}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => runDomainDiscovery(activeBroker)}
                  disabled={isCrawling}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 border border-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCrawling ? 'animate-spin' : ''}`} />
                  <span>{isCrawling ? 'Crawling Site...' : 'Crawl Site for Opt-Out Pages'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleInspectCandidateUrl(contact.optOutUrl)}
                  disabled={isInspecting}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <FileCode2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isInspecting ? 'Inspecting...' : 'Static HTML Inspect'}</span>
                </button>
              </div>
            </div>

            {/* Active Opt-Out URL + Record Search URL */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs">
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400 font-medium">
                    Active Opt-Out / Suppression Page
                    {contact.hasCustomOptOutUrl ? ' (Pinned Override)' : ''}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setDraftOptOutUrl(contact.optOutUrl);
                        setDraftOptOutTitle(contact.discoveredOptOutTitle || '');
                        setIsEditingOptOutUrl((v) => !v);
                      }}
                      className="text-[11px] text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>{isEditingOptOutUrl ? 'Cancel' : 'Edit URL'}</span>
                    </button>
                    {contact.hasCustomOptOutUrl && (
                      <button
                        type="button"
                        onClick={() => clearBrokerCustomOptOutUrl(activeBroker.id)}
                        className="text-[11px] text-slate-400 hover:text-white inline-flex items-center gap-1 cursor-pointer"
                        title="Reset to default catalog opt-out URL"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>
                </div>
                <a
                  href={contact.optOutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-emerald-400 hover:text-emerald-300 underline flex items-center justify-between gap-2 truncate"
                >
                  <span className="truncate">{contact.optOutUrl}</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
                {contact.discoveredOptOutTitle && (
                  <div className="text-[11px] text-slate-400 truncate">
                    Page Title: <span className="text-slate-200">{contact.discoveredOptOutTitle}</span>
                  </div>
                )}
              </div>

              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400 font-medium">
                    Step 1 Lookup — Direct Listing Search URL
                  </span>
                  <button
                    type="button"
                    onClick={() => markCopied('record-url', recordSearchUrl)}
                    className="text-[11px] text-slate-300 hover:text-white inline-flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'record-url' ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>Copy Link</span>
                  </button>
                </div>
                <a
                  href={recordSearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sky-400 hover:text-sky-300 underline flex items-center justify-between gap-2 truncate"
                >
                  <span className="truncate">{recordSearchUrl}</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
                <div className="text-[11px] text-slate-500 truncate">
                  Opens {activeBroker.domain} pre-queried for {profile.firstName} {profile.lastName}
                </div>
              </div>
            </div>

            {isEditingOptOutUrl && (
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5 text-xs">
                <div className="font-semibold text-white">
                  Save Discovered or Custom Opt-Out Form URL for {activeBroker.name}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="url"
                    value={draftOptOutUrl}
                    onChange={(e) => setDraftOptOutUrl(e.target.value)}
                    placeholder="https://broker.com/your-privacy-choices"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="text"
                    value={draftOptOutTitle}
                    onChange={(e) => setDraftOptOutTitle(e.target.value)}
                    placeholder="Optional page title (e.g. Your Privacy Choices)"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleSaveManualOptOutUrl}
                    className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold cursor-pointer whitespace-nowrap"
                  >
                    Save Official Opt-Out URL
                  </button>
                </div>
              </div>
            )}

            {discoveryError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{discoveryError}</span>
              </div>
            )}
          </div>

          {/* Section 1B: Autonomous Headless Browser Opt-Out Workflow Engine */}
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-5 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-400">
                  <Bot className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">
                    Playwright Chromium Workflow Engine
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>SSRF-Guarded</span>
                  <span aria-hidden="true">·</span>
                  <span>Zero CAPTCHA Evasion</span>
                </div>
                <h3 className="text-base font-bold text-white">
                  Autonomous Web-Form Discovery, Record Matching &amp; Submission
                </h3>
                <p className="text-slate-400 leading-relaxed">
                  Renders JavaScript SPAs, traverses multi-step privacy wizards, matches candidate
                  listings using multi-anchor jurisdiction checks, populates only permitted profile
                  fields, and captures SHA-256 DOM submission evidence.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleRunHeadlessWorkflow('inspect_and_preview')}
                  disabled={isWorkflowBusy}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white border border-slate-700 font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {isWorkflowBusy ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5 text-sky-400" />
                  )}
                  <span>Inspect &amp; Preview Live Form</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleRunHeadlessWorkflow('autonomous_auto_submit')}
                  disabled={isWorkflowBusy}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-extrabold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {isWorkflowBusy ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  <span>Autonomous Auto-Submit</span>
                </button>
              </div>
            </div>

            {/* Consumer Data Minimization & Disclosure Policy */}
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-200">
                  Data-Minimization Disclosure Policy (11 CCR § 7060)
                </span>
                <span className="font-mono text-[11px] text-slate-500">
                  SSN, Driver&apos;s License &amp; Govt ID uploads are always blocked
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-slate-300">
                {(
                  [
                    ['allowPhone', 'Allow Phone Number'],
                    ['allowStreetAddress', 'Allow Street Address'],
                    ['allowZip', 'Allow ZIP Code'],
                    ['allowBirthYearOrAge', 'Allow Birth Year / Age'],
                    ['allowAuthorizedAgent', 'Attach POA / Agent Flag'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={disclosurePolicy[key]}
                      onChange={(e) =>
                        setDisclosurePolicy((prev) => ({
                          ...prev,
                          [key]: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {workflowError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{workflowError}</span>
              </div>
            )}

            {/* Active Headless Workflow Job Panel */}
            {activeWorkflowJob && (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`font-bold ${
                          activeWorkflowJob.state === 'removal_verified' ||
                          activeWorkflowJob.state === 'awaiting_broker_processing'
                            ? 'text-emerald-400'
                            : activeWorkflowJob.state === 'awaiting_email_verification' ||
                              activeWorkflowJob.state === 'ready_to_submit'
                            ? 'text-sky-400'
                            : activeWorkflowJob.state === 'blocked' ||
                              activeWorkflowJob.state === 'awaiting_user_input'
                            ? 'text-amber-400'
                            : activeWorkflowJob.state === 'failed' ||
                              activeWorkflowJob.state === 'rejected'
                            ? 'text-rose-400'
                            : 'text-slate-200'
                        }`}
                      >
                        {formatWorkflowStateLabel(activeWorkflowJob.state)}
                      </span>
                      <span className="text-slate-600" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        Internal Audit ID: {activeWorkflowJob.internalSubmissionId}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-slate-400">
                      Broker Confirmation Code:{' '}
                      <strong className="text-white">
                        {activeWorkflowJob.brokerConfirmationCode ||
                          'None issued by broker portal'}
                      </strong>
                      {activeWorkflowJob.discoveredTitle && (
                        <>
                          {' '}
                          · Title: <span className="text-slate-300">{activeWorkflowJob.discoveredTitle}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowTraceLog((v) => !v)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-mono text-[11px] cursor-pointer"
                    >
                      {showTraceLog
                        ? 'Hide Trace'
                        : `Execution Trace (${activeWorkflowJob.steps.length})`}
                    </button>

                    {(activeWorkflowJob.state === 'awaiting_broker_processing' ||
                      activeWorkflowJob.state === 'submitted_unconfirmed' ||
                      activeWorkflowJob.state === 'awaiting_email_verification' ||
                      activeWorkflowJob.state === 'removal_verified') && (
                      <button
                        type="button"
                        onClick={handleRecheckListingRemoval}
                        disabled={isWorkflowBusy}
                        className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${isWorkflowBusy ? 'animate-spin' : ''}`}
                        />
                        <span>Re-Check Live Listing Removal</span>
                      </button>
                    )}

                    {activeWorkflowJob.state !== 'cancelled' &&
                      activeWorkflowJob.state !== 'removal_verified' && (
                        <button
                          type="button"
                          onClick={handleCancelWorkflow}
                          disabled={isWorkflowBusy}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-rose-400 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                      )}
                  </div>
                </div>

                {/* Blocker / Human Handoff Banner */}
                {activeWorkflowJob.blocker && (
                  <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3">
                    <div className="flex items-start gap-2 text-amber-200">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="font-bold">
                          Automation Paused ({activeWorkflowJob.blocker.kind})
                        </div>
                        <p className="text-amber-100/90 leading-relaxed">
                          {activeWorkflowJob.blocker.summary}
                        </p>
                      </div>
                    </div>

                    {activeWorkflowJob.blocker.requiresHumanAction && (
                      <div className="pt-2 border-t border-amber-500/20 space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={activeWorkflowJob.blocker.handoffUrl || contact.optOutUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <span>Open Handoff Page in Browser</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <button
                            type="button"
                            onClick={() => markCopied('handoff-script', autoFillScript)}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>
                              {copiedKey === 'handoff-script'
                                ? 'Copied Auto-Fill Script'
                                : 'Copy 1-Click Auto-Fill Script'}
                            </span>
                          </button>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <input
                            type="text"
                            value={handoffTicketInput}
                            onChange={(e) => setHandoffTicketInput(e.target.value)}
                            placeholder="Optional confirmation code displayed after completing CAPTCHA"
                            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                          />
                          <label className="inline-flex items-center gap-1.5 text-slate-200 whitespace-nowrap cursor-pointer">
                            <input
                              type="checkbox"
                              checked={handoffNeedsEmailVerify}
                              onChange={(e) => setHandoffNeedsEmailVerify(e.target.checked)}
                              className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                            />
                            <span>Check email link next</span>
                          </label>
                          <button
                            type="button"
                            onClick={handleRecordManualHandoff}
                            disabled={isWorkflowBusy}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold cursor-pointer whitespace-nowrap"
                          >
                            Confirm Handoff Completed
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Candidate Record Matches (Homonym Guard) */}
                {activeWorkflowJob.candidateRecords.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="font-bold text-white">
                      Candidate Person Records Found ({activeWorkflowJob.candidateRecords.length})
                    </div>
                    <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-900">
                      {activeWorkflowJob.candidateRecords.map((cand) => (
                        <label
                          key={cand.candidateId}
                          className={`p-3 flex items-start justify-between gap-3 cursor-pointer ${
                            cand.disqualifiedHomonym ? 'opacity-65' : 'hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <input
                              type="radio"
                              name="workflow-candidate-record"
                              checked={selectedCandidateId === cand.candidateId}
                              onChange={() => setSelectedCandidateId(cand.candidateId)}
                              className="mt-1 text-emerald-500 bg-slate-950 border-slate-700"
                            />
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-white">{cand.fullName}</span>
                                {cand.age && (
                                  <span className="font-mono text-slate-400">Age {cand.age}</span>
                                )}
                                {cand.locations.length > 0 && (
                                  <span className="text-slate-300">
                                    {cand.locations.join(' · ')}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate">
                                {cand.disqualifiedHomonym
                                  ? `Homonym Disqualified: ${cand.disqualifiedReason}`
                                  : cand.matchSignals.join(' · ') || cand.rawSnippet}
                              </div>
                            </div>
                          </div>
                          <span
                            className={`font-mono text-[11px] shrink-0 ${
                              cand.disqualifiedHomonym
                                ? 'text-rose-400'
                                : cand.confidenceScore >= 0.75
                                ? 'text-emerald-400'
                                : 'text-amber-400'
                            }`}
                          >
                            {Math.round(cand.confidenceScore * 100)}% Match
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Live Mapped DOM Form Controls */}
                {activeWorkflowJob.mappedFields.filter((f) => !f.preserveOriginalHidden).length >
                  0 && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                      <span>
                        Live Browser DOM Controls Mapped (
                        {
                          activeWorkflowJob.mappedFields.filter((f) => !f.preserveOriginalHidden)
                            .length
                        }
                        )
                      </span>
                      <span>
                        Hidden CSRF Tokens Preserved:{' '}
                        {activeWorkflowJob.mappedFields.filter((f) => f.preserveOriginalHidden).length}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {activeWorkflowJob.mappedFields
                        .filter((f) => !f.preserveOriginalHidden)
                        .map((field) => {
                          const isSkipped =
                            !field.disclosureAllowed ||
                            field.semanticRole === 'honeypot_trap' ||
                            field.semanticRole === 'sensitive_id_field' ||
                            field.semanticRole === 'marketing_opt_in';
                          return (
                            <div
                              key={field.fieldKey}
                              className={`p-2.5 rounded-lg border space-y-1 ${
                                isSkipped
                                  ? 'bg-slate-900/40 border-slate-800/80 opacity-75'
                                  : 'bg-slate-900 border-slate-800'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="font-semibold text-slate-200 truncate">
                                  {field.label || field.name || field.fieldKey}
                                  {field.required ? ' *' : ''}
                                </span>
                                <span
                                  className={`font-mono text-[10px] shrink-0 ${
                                    field.confidence >= 0.8
                                      ? 'text-emerald-400'
                                      : field.confidence >= 0.65
                                      ? 'text-amber-400'
                                      : 'text-rose-400'
                                  }`}
                                >
                                  {field.semanticRole} · {Math.round(field.confidence * 100)}%
                                </span>
                              </div>
                              {isSkipped ? (
                                <div className="text-[11px] font-mono text-amber-300/90">
                                  Skipped: {field.skipReason || 'Blocked by safety/disclosure policy'}
                                </div>
                              ) : (
                                <input
                                  type="text"
                                  value={liveFieldOverrides[field.fieldKey] ?? field.plannedValue}
                                  onChange={(e) =>
                                    setLiveFieldOverrides((prev) => ({
                                      ...prev,
                                      [field.fieldKey]: e.target.value,
                                    }))
                                  }
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                                />
                              )}
                            </div>
                          );
                        })}
                    </div>

                    {(activeWorkflowJob.state === 'ready_to_submit' ||
                      activeWorkflowJob.state === 'awaiting_user_input' ||
                      activeWorkflowJob.state === 'failed') && (
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={handleApproveAndSubmitWorkflow}
                          disabled={isWorkflowBusy}
                          className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-extrabold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          {isWorkflowBusy ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          <span>Approve &amp; Submit Live Opt-Out Form</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Inbound Email Confirmation Link Verifier */}
                {(activeWorkflowJob.state === 'awaiting_email_verification' ||
                  activeWorkflowJob.state === 'submitted_unconfirmed' ||
                  activeWorkflowJob.state === 'awaiting_broker_processing') && (
                  <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                    <div className="font-semibold text-white flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-sky-400" />
                      <span>Complete Inbound Email Opt-Out Confirmation Link</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      If {activeBroker.name} emailed a confirmation link, paste it below. synOUT
                      strips tracking parameters, verifies domain ownership against phishing, and
                      completes the confirmation step in headless Chromium.
                    </p>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="url"
                        value={verificationLinkInput}
                        onChange={(e) => setVerificationLinkInput(e.target.value)}
                        placeholder={`https://${activeBroker.domain}/optout/confirm?token=...`}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-sky-500"
                      />
                      <button
                        type="button"
                        onClick={handleCompleteEmailVerification}
                        disabled={isWorkflowBusy || !verificationLinkInput.trim()}
                        className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold cursor-pointer whitespace-nowrap"
                      >
                        Verify Confirmation Link
                      </button>
                    </div>
                    {activeWorkflowJob.emailVerification && (
                      <div className="text-[11px] text-emerald-300 font-mono">
                        Email Verified ({activeWorkflowJob.emailVerification.httpStatus}):{' '}
                        {activeWorkflowJob.emailVerification.summary}
                      </div>
                    )}
                  </div>
                )}

                {/* Recheck Result */}
                {activeWorkflowJob.recheckResult && (
                  <div
                    className={`p-3 rounded-xl border font-mono text-[11px] ${
                      activeWorkflowJob.recheckResult.verifiedRemoved
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}
                  >
                    Re-Verification ({activeWorkflowJob.recheckResult.checkedAtIso}):{' '}
                    {activeWorkflowJob.recheckResult.summary}
                  </div>
                )}

                {/* Tamper-Evident Submission Evidence Artifact */}
                {activeWorkflowJob.evidence && (
                  <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5 font-mono text-[11px]">
                    <div className="text-emerald-400 font-semibold flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Signed Submission Evidence Artifact</span>
                    </div>
                    <div className="text-slate-300">
                      Outcome: {activeWorkflowJob.evidence.outcomeSummary} (HTTP{' '}
                      {activeWorkflowJob.evidence.httpStatus})
                    </div>
                    <div className="text-slate-400 truncate">
                      DOM SHA-256: {activeWorkflowJob.evidence.domSnapshotSha256}
                    </div>
                    <div className="text-slate-400 truncate">
                      Manifest SHA-256: {activeWorkflowJob.evidence.evidenceManifestSha256}
                    </div>
                    {activeWorkflowJob.evidence.redactedResponseExcerpt && (
                      <div className="text-slate-500 truncate">
                        Portal Excerpt: {activeWorkflowJob.evidence.redactedResponseExcerpt}
                      </div>
                    )}
                  </div>
                )}

                {/* SSRF Intercepted Requests Warning */}
                {activeWorkflowJob.ssrfBlockedRequests.length > 0 && (
                  <div className="text-[11px] font-mono text-amber-300">
                    SSRF Guard Intercepted {activeWorkflowJob.ssrfBlockedRequests.length} unsafe
                    subresource request(s).
                  </div>
                )}

                {/* Expandable Action Trace */}
                {showTraceLog && activeWorkflowJob.steps.length > 0 && (
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1 font-mono text-[11px] max-h-48 overflow-y-auto">
                    {activeWorkflowJob.steps.map((st) => (
                      <div key={st.stepIndex} className="text-slate-300">
                        <span className="text-emerald-400">#{st.stepIndex}</span> [{st.state}]{' '}
                        <span className="text-white">{st.action}</span> — {st.details}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Discovered Disguised Opt-Out Pages (When Crawled) */}
          {discoveryReport && (
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Discovered Opt-Out &amp; Privacy Choice Pages on {discoveryReport.queriedDomain}
                  </h3>
                  <p className="text-xs text-slate-400 tabular-nums">
                    Probed {discoveryReport.probedUrlsCount} endpoints · Found{' '}
                    {discoveryReport.candidates.length} candidate opt-out/privacy routes regardless of
                    page title.
                  </p>
                </div>
              </div>

              {discoveryReport.fallbackReason && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-200">
                  {discoveryReport.fallbackReason}
                </div>
              )}

              <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-950">
                {discoveryReport.candidates.map((cand) => {
                  const isPinned = contact.optOutUrl === cand.url;
                  return (
                    <div
                      key={cand.url}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-white truncate">
                            {cand.pageTitle || cand.anchorText}
                          </span>
                          {typeof cand.httpStatus === 'number' && (
                            <span
                              className={`font-mono text-[11px] tabular-nums ${
                                cand.httpStatus >= 200 && cand.httpStatus < 400
                                  ? 'text-emerald-400'
                                  : 'text-amber-400'
                              }`}
                            >
                              HTTP {cand.httpStatus}
                            </span>
                          )}
                          <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                            · Match {cand.score}%
                          </span>
                        </div>
                        <a
                          href={cand.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[11px] text-sky-400 hover:underline flex items-center gap-1 truncate"
                        >
                          <span className="truncate">{cand.url}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                        {cand.signals.length > 0 && (
                          <div className="text-[11px] text-slate-500">
                            {cand.signals.join(' · ')}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleInspectCandidateUrl(cand.url)}
                          disabled={isInspecting}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer whitespace-nowrap"
                        >
                          Inspect Form
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePinCandidateOptOutUrl(cand)}
                          className={`px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                            isPinned
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                          }`}
                        >
                          <Pin className="w-3 h-3" />
                          <span>{isPinned ? 'Active URL' : 'Use URL'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 3: Universal Browser Auto-Fill + Static HTML Form Inspector */}
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  Browser Auto-Fill Bookmarklet &amp; Static HTML Form Inspector
                </h3>
                <p className="text-xs text-slate-400">
                  Client-side fallback for CAPTCHA/WAF-protected portals: fills inputs in your
                  own browser tab while skipping honeypots, SSN/ID fields, and marketing checkboxes.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowHtmlPasteDrawer((v) => !v)}
                className="text-xs font-semibold text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                <span>
                  {showHtmlPasteDrawer
                    ? 'Hide Raw HTML Analyzer'
                    : 'Paste Page HTML (Behind Cloudflare)'}
                </span>
              </button>
            </div>

            {showHtmlPasteDrawer && (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 text-xs">
                <p className="text-slate-300">
                  If {activeBroker.domain} blocks datacenter crawlers with Cloudflare, open the opt-out
                  page in your browser, press <span className="font-mono text-white">Ctrl+U</span>{' '}
                  (View Source) or Copy Outer HTML, and paste it below to extract and map every form
                  field offline:
                </p>
                <textarea
                  rows={4}
                  value={pastedRawHtml}
                  onChange={(e) => setPastedRawHtml(e.target.value)}
                  placeholder="<form action='/optout' method='POST'><input name='first_name' />...</form>"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleAnalyzePastedHtml}
                    className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold cursor-pointer whitespace-nowrap"
                  >
                    Parse Form Fields Offline
                  </button>
                </div>
              </div>
            )}

            {/* Universal Bookmarklet & Console Auto-Fill Strip */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-bold text-white">
                    Human-Assisted Browser Auto-Fill (Works on CAPTCHA, Cloudflare &amp; OneTrust)
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    1. Drag <strong className="text-emerald-400">synOUT Auto-Fill</strong> to your
                    Bookmarks Bar (or copy the script). 2. Open {activeBroker.name}&apos;s opt-out
                    page. 3. Click the bookmarklet to populate safe fields, solve any CAPTCHA, and
                    submit.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <a
                    href={contact.optOutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <span>Open Opt-Out Page</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <button
                    type="button"
                    onClick={() => markCopied('autofill-script', autoFillScript)}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {copiedKey === 'autofill-script' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied Auto-Fill Script</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Auto-Fill Script</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Live Inspected HTML Form Fields (if page was statically crawled/inspected) */}
            {activeInspection && (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="space-y-0.5">
                    <div className="font-bold text-white">
                      Inspected Page Title: &ldquo;{activeInspection.pageTitle}&rdquo;
                    </div>
                    <div className="text-[11px] text-slate-400">
                      HTTP {activeInspection.httpStatus} · Gate: {activeInspection.antiBotGate} ·{' '}
                      {activeInspection.antiBotSummary}
                    </div>
                  </div>
                  {activeInspection.gpcSupportedHint && (
                    <span className="font-mono text-[11px] text-emerald-400">
                      Sec-GPC: 1 Honored
                    </span>
                  )}
                </div>

                {visibleFormFields.length > 0 && primaryForm ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                      <span>
                        Detected Form ({primaryForm.method} {primaryForm.actionUrl})
                      </span>
                      <span>{visibleFormFields.length} Consumer Inputs Mapped</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {visibleFormFields.map((field) => (
                        <div key={field.key} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <label className="text-slate-300 font-medium truncate">
                              {field.label}
                              {field.required ? ' *' : ''}
                            </label>
                            <span className="font-mono text-[10px] text-slate-500">
                              {field.semanticRole} · {Math.round(field.confidence * 100)}%
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={editedFieldValues[field.name] ?? field.suggestedValue}
                              onChange={(e) =>
                                setEditedFieldValues((prev) => ({
                                  ...prev,
                                  [field.name]: e.target.value,
                                }))
                              }
                              className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                markCopied(
                                  `fld-${field.key}`,
                                  editedFieldValues[field.name] ?? field.suggestedValue
                                )
                              }
                              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 cursor-pointer"
                              title={`Copy ${field.label}`}
                            >
                              {copiedKey === `fld-${field.key}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {relayFeedback && (
                      <div
                        className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                          relayFeedback.ok
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                        }`}
                      >
                        {relayFeedback.ok ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        )}
                        <span>{relayFeedback.message}</span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={handleDirectFormRelaySubmit}
                        disabled={isSubmittingRelay}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-extrabold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {isSubmittingRelay ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {isSubmittingRelay
                            ? 'Transmitting Form Payload...'
                            : `Submit via HTTP Relay (${primaryForm.submitButtonLabel})`}
                        </span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400">
                    No static HTML{' '}
                    <span className="font-mono text-slate-200">&lt;form&gt;</span> inputs were
                    embedded in the raw server response (client-rendered SPA or WAF-gated page).
                    Click <strong className="text-emerald-400">Inspect &amp; Preview Live Form</strong>{' '}
                    above to render JavaScript in headless Chromium, or use the{' '}
                    <strong className="text-emerald-400">synOUT Auto-Fill Bookmarklet</strong>.
                  </p>
                )}
              </div>
            )}

            {/* Quick Copy Profile Values Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
              {[
                {
                  key: 'fullName',
                  label: 'Full Name',
                  val: `${profile.firstName} ${profile.lastName}`.trim(),
                },
                { key: 'email', label: 'Email', val: senderEmail || 'Not set' },
                { key: 'phone', label: 'Phone', val: profile.phoneNumbers[0] || 'Not set' },
                {
                  key: 'loc',
                  label: 'City & State',
                  val: `${profile.currentCity}, ${profile.currentState} ${profile.currentZip || ''}`.trim(),
                },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => markCopied(`quick-${item.key}`, item.val)}
                  className="p-3 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 rounded-xl flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-500 block">{item.label}</span>
                    <span className="font-mono text-white truncate block">{item.val}</span>
                  </div>
                  {copiedKey === `quick-${item.key}` ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Section 4: Record Web-Form Receipt + Companion Statutory CCPA Email */}
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-white">
                  Dual-Channel Completion: Log Genuine Broker Ticket &amp; Send Statutory Email
                </h3>
                <p className="text-slate-400">
                  Leave the ticket box blank if the broker did not display a confirmation code —
                  synOUT tracks unconfirmed submissions honestly without inventing fake tickets.
                </p>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span className={isFormLogged ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                  {isFormLogged ? 'Web Form Tracked' : 'Form Pending'}
                </span>
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
                <span className={isEmailSent ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                  {isEmailSent ? 'Email Sent' : 'Email Optional'}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <input
                type="text"
                value={manualTicketInput}
                onChange={(e) => setManualTicketInput(e.target.value)}
                placeholder="Optional broker confirmation code shown on portal (leave empty if none issued)"
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={handleLogCompletedWebForm}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>{isFormLogged ? 'Update Web-Form Record' : 'Log Web-Form Submission'}</span>
              </button>
            </div>

            {contact.effectivePrimaryEmail && (
              <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-slate-300">
                  Companion Statutory CCPA Email Desk:{' '}
                  <span className="font-mono text-emerald-400">{contact.effectivePrimaryEmail}</span>
                </div>

                {isDirectSendConnected ? (
                  <button
                    type="button"
                    onClick={handleSendCompanionEmail}
                    disabled={isSendingEmail}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    {isSendingEmail ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Mail className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    <span>
                      {isEmailSent
                        ? 'Re-Send Statutory CCPA Email'
                        : `Also Send CCPA Email (${activeConnectedEmail})`}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenConnectEmail}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-300 font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Connect Email for Dual-Channel Proof</span>
                  </button>
                )}
              </div>
            )}

            {emailFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs ${
                  emailFeedback.ok
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                {emailFeedback.text}
              </div>
            )}
          </div>

          {/* Section 5: Search-Engine Deep Opt-Out Page Finders */}
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 text-xs">
            <div>
              <h3 className="text-base font-bold text-white">
                Search-Engine Hidden Opt-Out Page Finders for {activeBroker.domain}
              </h3>
              <p className="text-slate-400">
                If a broker renamed their removal form to an obscure title or moved URLs, these
                surgical site-dorks surface the exact indexed form page across Google, DuckDuckGo,
                Bing, and Brave.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {searchDorks.map((dork) => (
                <div
                  key={dork.id}
                  className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2"
                >
                  <div className="font-bold text-white">{dork.label}</div>
                  <p className="text-[11px] text-slate-400">{dork.description}</p>
                  <div className="font-mono text-[11px] text-slate-300 bg-slate-900 p-2 rounded border border-slate-800 truncate">
                    {dork.query}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <a
                      href={dork.googleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <span>Google</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <a
                      href={dork.duckDuckGoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <span>DuckDuckGo</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <a
                      href={dork.bingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <span>Bing</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <a
                      href={dork.braveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <span>Brave</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
