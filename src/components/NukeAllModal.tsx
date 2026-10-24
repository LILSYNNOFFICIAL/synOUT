import React, { useState, useMemo } from 'react';
import { DataBroker, DeindexItem, ScanResult, UserProfile } from '../types';
import {
  useEmailConnection,
  sendEmailViaConnectedAccount,
} from '../services/emailConnectionStore';
import {
  useBrokerContactOverrides,
  setBrokerCustomEmail,
  markBrokerEmailBounced,
  verifyRecipientDeliverabilityClient,
  RecipientDeliverabilityVerification,
} from '../utils/brokerContactResolver';
import { triggerAutonomousRegistryExpansion } from '../utils/dynamicBrokerRegistry';
import { BureauChecklistState } from '../utils/workspaceVault';
import {
  buildNukeAllTargetMatrix,
  buildMassBccWebmailBatches,
  NukeTargetItem,
} from '../utils/nukeAllEngine';
import { copyTextToClipboard } from '../utils/exportEngines';
import {
  buildAutoFillBookmarkletHref,
  buildUniversalAutoFillScript,
  classifyBrokerChannelStrategy,
  hasWebFormSubmission,
} from '../utils/optOutFormEngine';
import {
  Flame,
  X,
  Mail,
  Send,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Edit3,
  Copy,
  Check,
  Plus,
  UserCheck,
  FileCode2,
  Bookmark,
} from 'lucide-react';

interface NukeAllModalProps {
  profile: UserProfile;
  hasCustomProfile: boolean;
  scanResults: ScanResult[];
  bureauProgress: Record<string, BureauChecklistState>;
  deindexQueue: DeindexItem[];
  onUpdateProfile: (updated: UserProfile) => void;
  onBrokerNuked: (broker: DataBroker, receiptMessageId: string) => void;
  onBureauNuked: (bureauId: string, receiptMessageId: string) => void;
  onDeindexNuked: (deindexId: string, receiptMessageId: string) => void;
  onOpenConnectEmail: () => void;
  onOpenWebFormWorkbench?: (broker?: DataBroker) => void;
  onBrokerWebFormLogged?: (broker: DataBroker, optOutUrl?: string) => void;
  onClose: () => void;
}

interface TargetExecutionStatus {
  state: 'sent' | 'rerouted' | 'failed';
  deliveredTo?: string;
  receipt?: string;
  error?: string;
}

export const NukeAllModal: React.FC<NukeAllModalProps> = ({
  profile,
  hasCustomProfile,
  scanResults,
  bureauProgress,
  deindexQueue,
  onUpdateProfile,
  onBrokerNuked,
  onBureauNuked,
  onDeindexNuked,
  onOpenConnectEmail,
  onOpenWebFormWorkbench,
  onBrokerWebFormLogged,
  onClose,
}) => {
  const { isDirectSendConnected, activeConnectedEmail, smtp } = useEmailConnection();
  const contactOverrides = useBrokerContactOverrides();

  // Dispatch mode tab: direct connected dispatch vs instant BCC webmail batches vs web-form portal queue
  const [dispatchMode, setDispatchMode] = useState<'direct' | 'webmail' | 'webforms'>(
    isDirectSendConnected ? 'direct' : 'webmail'
  );

  // Target Scope Controls
  const [includeExposedBrokers, setIncludeExposedBrokers] = useState<boolean>(true);
  const [includeFullBrokerCatalog, setIncludeFullBrokerCatalog] = useState<boolean>(true);
  const [includeSpecialtyBureaus, setIncludeSpecialtyBureaus] = useState<boolean>(true);
  const [includeWebmasterDeindex, setIncludeWebmasterDeindex] = useState<boolean>(true);
  const [includeAlreadyDispatched, setIncludeAlreadyDispatched] = useState<boolean>(false);
  const [skipPortalPrimaryInboxes, setSkipPortalPrimaryInboxes] = useState<boolean>(false);
  const [ccBackupDpo, setCcBackupDpo] = useState<boolean>(true);
  const [bccSelf, setBccSelf] = useState<boolean>(false);
  const [registryVersion, setRegistryVersion] = useState<number>(0);
  const [expansionMsg, setExpansionMsg] = useState<string | null>(null);

  // Quick Identity Editor (especially helpful if user clicked NUKE ALL before running a scan)
  const [isEditingIdentity, setIsEditingIdentity] = useState<boolean>(!hasCustomProfile);
  const [firstName, setFirstName] = useState<string>(profile.firstName);
  const [lastName, setLastName] = useState<string>(profile.lastName);
  const [currentCity, setCurrentCity] = useState<string>(profile.currentCity);
  const [currentState, setCurrentState] = useState<string>(profile.currentState);
  const [primaryPhone, setPrimaryPhone] = useState<string>(profile.phoneNumbers[0] || '');
  const [primaryEmail, setPrimaryEmail] = useState<string>(
    activeConnectedEmail || profile.emails[0] || ''
  );

  // Pre-flight MX & Override Editor
  const [mxResults, setMxResults] = useState<Record<string, RecipientDeliverabilityVerification>>({});
  const [isCheckingAllMx, setIsCheckingAllMx] = useState<boolean>(false);
  const [mxSummaryBanner, setMxSummaryBanner] = useState<string | null>(null);
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [overrideInput, setOverrideInput] = useState<string>('');
  const [overrideError, setOverrideError] = useState<string | null>(null);

  // Arm & Mass Execution State
  const [isArmed, setIsArmed] = useState<boolean>(false);
  const [isNuking, setIsNuking] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number; currentName: string } | null>(
    null
  );
  const [executionResults, setExecutionResults] = useState<Record<string, TargetExecutionStatus>>({});
  const [completedSummary, setCompletedSummary] = useState<{
    sent: number;
    rerouted: number;
    failed: number;
  } | null>(null);

  // Webmail & Web-Form copy helpers
  const [copiedAllEmails, setCopiedAllEmails] = useState<boolean>(false);
  const [copiedOmnibusBody, setCopiedOmnibusBody] = useState<boolean>(false);
  const [copiedAutoFillScript, setCopiedAutoFillScript] = useState<boolean>(false);
  const [loggedWebFormIds, setLoggedWebFormIds] = useState<Record<string, boolean>>({});

  const effectiveProfile: UserProfile = useMemo(
    () => ({
      ...profile,
      firstName: firstName.trim() || profile.firstName || 'Consumer',
      lastName: lastName.trim() || profile.lastName || 'Requestor',
      currentCity: currentCity.trim() || profile.currentCity,
      currentState: currentState.trim() || profile.currentState,
      phoneNumbers: primaryPhone.trim()
        ? Array.from(new Set([primaryPhone.trim(), ...profile.phoneNumbers.filter(Boolean)]))
        : profile.phoneNumbers,
      emails: primaryEmail.trim()
        ? Array.from(new Set([primaryEmail.trim(), ...profile.emails.filter(Boolean)]))
        : profile.emails,
    }),
    [profile, firstName, lastName, currentCity, currentState, primaryPhone, primaryEmail]
  );

  const senderEmail = activeConnectedEmail || primaryEmail.trim() || profile.emails[0] || '';

  const targets: NukeTargetItem[] = useMemo(() => {
    void registryVersion;
    return buildNukeAllTargetMatrix({
      profile: effectiveProfile,
      senderEmail,
      scanResults,
      bureauProgress,
      deindexQueue,
      contactOverrides,
      includeExposedBrokers,
      includeFullBrokerCatalog,
      includeSpecialtyBureaus,
      includeWebmasterDeindex,
      includeAlreadyDispatched,
      skipPortalPrimaryInboxes,
    });
  }, [
    effectiveProfile,
    senderEmail,
    scanResults,
    bureauProgress,
    deindexQueue,
    contactOverrides,
    includeExposedBrokers,
    includeFullBrokerCatalog,
    includeSpecialtyBureaus,
    includeWebmasterDeindex,
    includeAlreadyDispatched,
    skipPortalPrimaryInboxes,
    registryVersion,
  ]);

  const webmailBatches = useMemo(
    () => buildMassBccWebmailBatches(targets, effectiveProfile, senderEmail, 18),
    [targets, effectiveProfile, senderEmail]
  );

  const portalPrimaryTargets = useMemo(() => {
    const portalFirst = targets.filter(
      (t) =>
        Boolean(t.brokerRef) &&
        (t.requiresPortalWarning || classifyBrokerChannelStrategy(t.brokerRef!) !== 'email_primary')
    );
    return portalFirst.length > 0 ? portalFirst : targets.filter((t) => Boolean(t.brokerRef));
  }, [targets]);

  const autoFillScript = useMemo(
    () => buildUniversalAutoFillScript(effectiveProfile),
    [effectiveProfile]
  );
  const bookmarkletHref = useMemo(
    () => buildAutoFillBookmarkletHref(effectiveProfile),
    [effectiveProfile]
  );

  const countsByKind = useMemo(() => {
    return {
      exposed: targets.filter((t) => t.kind === 'exposed_broker').length,
      catalog: targets.filter((t) => t.kind === 'catalog_broker').length,
      bureaus: targets.filter((t) => t.kind === 'specialty_bureau').length,
      deindex: targets.filter((t) => t.kind === 'webmaster_deindex').length,
    };
  }, [targets]);

  const handleSaveIdentity = () => {
    onUpdateProfile(effectiveProfile);
    setIsEditingIdentity(false);
  };

  const handleExpandWebsitePool = () => {
    const res = triggerAutonomousRegistryExpansion();
    setRegistryVersion((v) => v + 1);
    setExpansionMsg(
      res.newBrokers.length > 0
        ? `Added ${res.newBrokers.length} additional people-search websites (${res.newBrokers
            .map((b) => b.name)
            .join(', ')}) to the mass removal queue.`
        : `All ${res.totalRegistrySize} verified data brokers & people-search websites are already loaded.`
    );
  };

  const handleVerifyAllMx = async () => {
    if (targets.length === 0) return;
    setIsCheckingAllMx(true);
    setMxSummaryBanner(null);
    const nextMx: Record<string, RecipientDeliverabilityVerification> = {};
    let verifiedCount = 0;
    let autoSwitchedCount = 0;
    let portalRequiredCount = 0;

    for (const item of targets) {
      try {
        const check = await verifyRecipientDeliverabilityClient(
          item.recipientEmail,
          item.fallbackEmails
        );
        nextMx[item.id] = check;
        if (check.mxVerified) {
          verifiedCount++;
          if (
            check.usedFallback &&
            check.recommendedEmail &&
            item.brokerId &&
            check.recommendedEmail.toLowerCase() !== item.recipientEmail.toLowerCase()
          ) {
            setBrokerCustomEmail(item.brokerId, check.recommendedEmail);
            autoSwitchedCount++;
          }
        } else {
          portalRequiredCount++;
        }
      } catch {
        // Keep moving if network check times out on an item
      }
    }

    setMxResults(nextMx);
    setIsCheckingAllMx(false);
    setMxSummaryBanner(
      `MX Pre-Flight Complete: ${verifiedCount} of ${targets.length} compliance domains verified${
        autoSwitchedCount > 0 ? ` · ${autoSwitchedCount} auto-switched to verified backup DPO` : ''
      }${portalRequiredCount > 0 ? ` · ${portalRequiredCount} require web portal submission` : ''}.`
    );
  };

  const handleSaveTargetOverride = (item: NukeTargetItem) => {
    if (!item.brokerId) {
      setOverrideError('Custom DPO override applies to data broker & website entries.');
      return;
    }
    try {
      setBrokerCustomEmail(item.brokerId, overrideInput);
      setEditingTargetId(null);
      setOverrideError(null);
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : 'Enter a valid email address.');
    }
  };

  const handleExecuteMassNuke = async () => {
    if (!isDirectSendConnected || !isArmed || targets.length === 0) return;
    onUpdateProfile(effectiveProfile);
    setIsNuking(true);
    setCompletedSummary(null);

    const senderFullName =
      `${effectiveProfile.firstName} ${effectiveProfile.lastName}`.trim() || 'Authorized Consumer';
    let sent = 0;
    let rerouted = 0;
    let failed = 0;

    for (let i = 0; i < targets.length; i++) {
      const item = targets[i];
      setProgress({
        current: i + 1,
        total: targets.length,
        currentName: item.name,
      });

      try {
        const res = await sendEmailViaConnectedAccount({
          recipientEmail: item.recipientEmail,
          fallbackRecipientEmails: item.fallbackEmails,
          ccEmails: ccBackupDpo ? item.recommendedCcEmails : [],
          subject: item.subject,
          body: item.body,
          senderName: senderFullName,
          brokerId: item.brokerId || item.bureauId || item.deindexId || item.id,
          brokerName: item.name,
          brokerDomain: item.domain,
          bccSelf,
        });

        const deliveredAddr = res.deliveredTo || item.recipientEmail;
        if (res.usedFallback && item.brokerId) {
          rerouted++;
          markBrokerEmailBounced(item.brokerId, item.recipientEmail);
        }
        sent++;

        setExecutionResults((prev) => ({
          ...prev,
          [item.id]: {
            state: res.usedFallback ? 'rerouted' : 'sent',
            deliveredTo: deliveredAddr,
            receipt: res.messageId,
          },
        }));

        if (item.brokerRef) {
          onBrokerNuked(item.brokerRef, res.messageId);
        } else if (item.bureauId) {
          onBureauNuked(item.bureauId, res.messageId);
        } else if (item.deindexId) {
          onDeindexNuked(item.deindexId, res.messageId);
        }
      } catch (err) {
        failed++;
        setExecutionResults((prev) => ({
          ...prev,
          [item.id]: {
            state: 'failed',
            error: err instanceof Error ? err.message : 'Delivery rejected — use official portal',
          },
        }));
      }
    }

    setProgress(null);
    setIsNuking(false);
    setCompletedSummary({ sent, rerouted, failed });
  };

  const handleLogWebmailBatchLaunch = (batchIndex: number, providerTag: string) => {
    onUpdateProfile(effectiveProfile);
    const batch = webmailBatches[batchIndex - 1];
    if (!batch) return;
    const recipientSet = new Set(batch.recipients.map((r) => r.toLowerCase()));
    const stamp = `NUKE-${providerTag}-${Date.now().toString(36).toUpperCase()}`;

    for (const item of targets) {
      if (!recipientSet.has(item.recipientEmail.toLowerCase())) continue;
      if (item.brokerRef) {
        onBrokerNuked(item.brokerRef, stamp);
      } else if (item.bureauId) {
        onBureauNuked(item.bureauId, stamp);
      } else if (item.deindexId) {
        onDeindexNuked(item.deindexId, stamp);
      }
    }
  };

  const handleCopyAllDpoAddresses = () => {
    const uniqueEmails = Array.from(new Set(targets.map((t) => t.recipientEmail)));
    void copyTextToClipboard(uniqueEmails.join(', '));
    setCopiedAllEmails(true);
    setTimeout(() => setCopiedAllEmails(false), 2000);
  };

  const handleCopyOmnibusLetter = () => {
    if (webmailBatches.length === 0) return;
    const first = webmailBatches[0];
    void copyTextToClipboard(`${first.subject}\n\n${first.body}`);
    setCopiedOmnibusBody(true);
    setTimeout(() => setCopiedOmnibusBody(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nuke-all-modal-title"
    >
      <div className="bg-slate-900 border border-red-500/40 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Top Tactical Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-red-950/60 via-slate-900 to-slate-900 border-b border-red-500/30 flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-red-300 tabular-nums">
              <Flame className="w-4 h-4 text-red-400 shrink-0" />
              <span className="font-bold uppercase tracking-wider">NUKE ALL Mass Removal Protocol</span>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="text-slate-300">{targets.length} Queued Compliance Targets</span>
            </div>
            <h2 id="nuke-all-modal-title" className="text-xl sm:text-2xl font-extrabold text-white">
              Mass-Email All Data Brokers, People-Search Websites &amp; Clearinghouses
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Dispatches binding CCPA, CPRA, TDPSA &amp; GDPR deletion and permanent do-not-re-index
              demands across exposed brokers, the full people-search website catalog, specialty
              clearinghouses, and cached URLs—with live DNS MX verification and parent-DPO failover.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isNuking}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-40"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* 1. Consumer Identity Confirmation Bar */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2 text-slate-300">
                <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-semibold text-white">
                  Subject Identity Embedded in Removal Demands:
                </span>
                <span className="font-mono text-emerald-300">
                  {effectiveProfile.firstName} {effectiveProfile.lastName} ({effectiveProfile.currentCity},{' '}
                  {effectiveProfile.currentState})
                </span>
                {senderEmail && (
                  <>
                    <span aria-hidden="true" className="text-slate-600">
                      ·
                    </span>
                    <span className="font-mono text-slate-400">{senderEmail}</span>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsEditingIdentity(!isEditingIdentity)}
                className="text-xs font-semibold text-sky-400 hover:text-sky-300 cursor-pointer whitespace-nowrap"
              >
                {isEditingIdentity ? 'Hide Identity Fields' : 'Edit Subject Identity'}
              </button>
            </div>

            {isEditingIdentity && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800/80">
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First Name"
                  className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500/50"
                />
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last Name"
                  className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500/50"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={currentCity}
                    onChange={(e) => setCurrentCity(e.target.value)}
                    placeholder="City"
                    className="col-span-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500/50"
                  />
                  <input
                    type="text"
                    value={currentState}
                    onChange={(e) => setCurrentState(e.target.value.toUpperCase())}
                    placeholder="ST"
                    maxLength={2}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-red-500/50"
                  />
                </div>
                <input
                  type="text"
                  value={primaryPhone}
                  onChange={(e) => setPrimaryPhone(e.target.value)}
                  placeholder="Phone (e.g. 916-555-0144)"
                  className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-red-500/50"
                />
                <input
                  type="email"
                  value={primaryEmail}
                  onChange={(e) => setPrimaryEmail(e.target.value)}
                  placeholder="Reply Email Address"
                  className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-red-500/50"
                />
                <button
                  type="button"
                  onClick={handleSaveIdentity}
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                >
                  Apply Identity to All Notices
                </button>
              </div>
            )}
          </div>

          {/* 2. Target Scope & Bounce-Mitigation Controls */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-white">
                Target Scope &amp; Deliverability Safeguards
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExpandWebsitePool}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Expand Discovered Websites</span>
                </button>
                <button
                  type="button"
                  onClick={handleVerifyAllMx}
                  disabled={isCheckingAllMx || targets.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingAllMx ? 'animate-spin' : ''}`} />
                  <span>
                    {isCheckingAllMx ? 'Checking DNS MX...' : 'Verify All Recipient MX Servers'}
                  </span>
                </button>
              </div>
            </div>

            {expansionMsg && (
              <p className="text-xs text-emerald-400">{expansionMsg}</p>
            )}

            {mxSummaryBanner && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-xs text-emerald-200">
                {mxSummaryBanner}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-300 tabular-nums">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeExposedBrokers}
                  onChange={(e) => setIncludeExposedBrokers(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-red-500"
                />
                <span>
                  Exposed Scan Brokers ({countsByKind.exposed} queued)
                </span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeFullBrokerCatalog}
                  onChange={(e) => setIncludeFullBrokerCatalog(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-red-500"
                />
                <span>
                  All Indexed People-Search Websites ({countsByKind.catalog} queued)
                </span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSpecialtyBureaus}
                  onChange={(e) => setIncludeSpecialtyBureaus(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-red-500"
                />
                <span>
                  Specialty Bureaus &amp; Direct-Mail Registries ({countsByKind.bureaus} queued)
                </span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeWebmasterDeindex}
                  onChange={(e) => setIncludeWebmasterDeindex(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-red-500"
                />
                <span>
                  Search Engine / Website Cache Purge URLs ({countsByKind.deindex} queued)
                </span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ccBackupDpo}
                  onChange={(e) => setCcBackupDpo(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                />
                <span>CC verified parent-entity / backup DPO desks</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipPortalPrimaryInboxes}
                  onChange={(e) => setSkipPortalPrimaryInboxes(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-amber-500"
                />
                <span>Skip web-portal-primary directory inboxes</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer sm:col-span-2">
                <input
                  type="checkbox"
                  checked={includeAlreadyDispatched}
                  onChange={(e) => setIncludeAlreadyDispatched(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-red-500"
                />
                <span>Include targets that already received an opt-out notice (force re-send)</span>
              </label>
            </div>
          </div>

          {/* 3. Execution Channel Switcher */}
          <div className="space-y-4">
            <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setDispatchMode('direct')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  dispatchMode === 'direct'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Automated Individualized Mass Send ({targets.length} Emails)
              </button>
              <button
                type="button"
                onClick={() => setDispatchMode('webmail')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  dispatchMode === 'webmail'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Instant Mass BCC Webmail Blast ({webmailBatches.length} Batch
                {webmailBatches.length === 1 ? '' : 'es'})
              </button>
              <button
                type="button"
                onClick={() => setDispatchMode('webforms')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                  dispatchMode === 'webforms'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-emerald-300 hover:text-white'
                }`}
              >
                <FileCode2 className="w-3.5 h-3.5" />
                <span>Web-Form &amp; Portal Queue ({portalPrimaryTargets.length} Portals)</span>
              </button>
            </div>

            {dispatchMode === 'direct' ? (
              <div className="p-4 sm:p-5 bg-slate-950 border border-red-500/30 rounded-xl space-y-4">
                {!isDirectSendConnected ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>Connect Your Email Account for Automated Individualized Dispatch</span>
                      </div>
                      <p className="text-xs text-slate-400">
                        Connect Gmail, Outlook, Yahoo, iCloud, Proton, or Google OAuth once so
                        synOUT can transmit {targets.length} personalized statutory demands directly
                        on your behalf—or switch to the{' '}
                        <button
                          type="button"
                          onClick={() => setDispatchMode('webmail')}
                          className="text-red-400 hover:text-red-300 underline font-semibold cursor-pointer"
                        >
                          Instant Mass BCC Webmail Blast
                        </button>{' '}
                        tab right now without connecting credentials.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenConnectEmail();
                      }}
                      className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      <Mail className="w-4 h-4" />
                      <span>Connect Email Now</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-slate-300">
                        Connected Sender:{' '}
                        <strong className="font-mono text-emerald-400">
                          {activeConnectedEmail}
                        </strong>
                      </span>
                      {smtp?.verified && (
                        <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bccSelf}
                            onChange={(e) => setBccSelf(e.target.checked)}
                            className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                          />
                          <span>BCC myself on every sent notice</span>
                        </label>
                      )}
                    </div>

                    <label className="flex items-start gap-2.5 p-3.5 bg-red-950/30 border border-red-500/30 rounded-xl text-xs text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isArmed}
                        onChange={(e) => setIsArmed(e.target.checked)}
                        disabled={isNuking || targets.length === 0}
                        className="mt-0.5 rounded border-red-500/50 bg-slate-950 text-red-600"
                      />
                      <span>
                        <strong>Arm Mass Removal Dispatch:</strong> I authorize synOUT to verify DNS
                        MX records and transmit{' '}
                        <strong className="text-white tabular-nums">{targets.length}</strong>{' '}
                        individualized statutory deletion demands directly from{' '}
                        <span className="font-mono text-emerald-300">{activeConnectedEmail}</span>{' '}
                        to all queued data brokers, websites, and clearinghouses.
                      </span>
                    </label>

                    {progress && (
                      <div className="space-y-2 p-3.5 bg-slate-900 border border-red-500/30 rounded-xl">
                        <div className="flex items-center justify-between text-xs tabular-nums">
                          <span className="font-semibold text-white flex items-center gap-2">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-red-400" />
                            <span>Dispatching to {progress.currentName}...</span>
                          </span>
                          <span className="font-mono text-red-300">
                            {progress.current} / {progress.total}
                          </span>
                        </div>
                        <progress
                          value={progress.current}
                          max={Math.max(1, progress.total)}
                          className="w-full h-2 rounded-full overflow-hidden [&::-webkit-progress-bar]:bg-slate-800 [&::-webkit-progress-value]:bg-red-500 [&::-moz-progress-bar]:bg-red-500"
                        />
                      </div>
                    )}

                    {completedSummary && (
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-200 flex items-start gap-2.5">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <span className="font-bold text-white block">
                            NUKE ALL Mass Dispatch Finished
                          </span>
                          <span>
                            Transmitted{' '}
                            <strong className="tabular-nums">{completedSummary.sent}</strong>{' '}
                            statutory deletion demands from{' '}
                            <span className="font-mono">{activeConnectedEmail}</span>
                            {completedSummary.rerouted > 0
                              ? ` (${completedSummary.rerouted} automatically rerouted to verified backup DPO desks)`
                              : ''}
                            {completedSummary.failed > 0
                              ? ` · ${completedSummary.failed} require manual web portal opt-out below.`
                              : '. All 45-day SLA timers are now active in your Removal Tracker.'}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={handleExecuteMassNuke}
                        disabled={!isArmed || isNuking || targets.length === 0}
                        className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 shadow-lg shadow-red-600/25 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap tabular-nums"
                      >
                        <Flame className="w-4 h-4" />
                        <span>
                          {isNuking
                            ? 'NUKING BROKER REGISTRIES...'
                            : `NUKE ALL — SEND ${targets.length} DELETION EMAILS NOW`}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : dispatchMode === 'webmail' ? (
              /* Instant Mass BCC Webmail Blast Mode */
              <div className="p-4 sm:p-5 bg-slate-950 border border-slate-800 rounded-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-white">
                      Zero-Credential Mass BCC Webmail Launcher
                    </div>
                    <p className="text-xs text-slate-400">
                      Opens your signed-in webmail or mail app pre-addressed via{' '}
                      <span className="font-mono text-slate-200">BCC:</span> to every verified data
                      broker &amp; website DPO in URL-safe batches with a multi-state statutory
                      omnibus deletion demand.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleCopyAllDpoAddresses}
                      disabled={targets.length === 0}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                    >
                      {copiedAllEmails ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied DPO List</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy All DPO Emails</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyOmnibusLetter}
                      disabled={webmailBatches.length === 0}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                    >
                      {copiedOmnibusBody ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied Demand</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Omnibus Notice</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {webmailBatches.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    Enable at least one target category above to generate mass BCC batches.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {webmailBatches.map((batch) => (
                      <div
                        key={batch.batchIndex}
                        className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="font-bold text-white tabular-nums">
                            Mass BCC Batch {batch.batchIndex} of {batch.totalBatches} ·{' '}
                            {batch.recipients.length} DPO Inboxes
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {batch.targetNames.join(', ')}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <a
                            href={batch.gmailUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => handleLogWebmailBatchLaunch(batch.batchIndex, 'GMAIL')}
                            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                          >
                            <span>NUKE via Gmail Web</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <a
                            href={batch.outlookUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => handleLogWebmailBatchLaunch(batch.batchIndex, 'OUTLOOK')}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                          >
                            <span>Outlook.com</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <a
                            href={batch.yahooUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => handleLogWebmailBatchLaunch(batch.batchIndex, 'YAHOO')}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                          >
                            <span>Yahoo</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <a
                            href={batch.mailtoUrl}
                            onClick={() => handleLogWebmailBatchLaunch(batch.batchIndex, 'MAILTO')}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                          >
                            <Send className="w-3 h-3" />
                            <span>Mail App</span>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Web-Form & Disguised Opt-Out Portal Queue Mode */
              <div className="p-4 sm:p-5 bg-slate-950 border border-emerald-500/30 rounded-xl space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-white">
                      Web-Form &amp; Disguised Opt-Out Page Companion Queue ({portalPrimaryTargets.length} Brokers)
                    </div>
                    <p className="text-xs text-slate-400 max-w-2xl">
                      Some brokers require submitting an online web form (titled &ldquo;Your Privacy Choices&rdquo;, &ldquo;Do Not Sell or Share&rdquo;, or &ldquo;Data Suppression Center&rdquo;) in addition to email. Copy the universal auto-fill script or open the Opt-Out Page Finder to spider &amp; auto-fill any broker form.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <a
                      ref={(el) => {
                        if (el && bookmarkletHref) {
                          el.setAttribute('href', bookmarkletHref);
                        }
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        void copyTextToClipboard(autoFillScript);
                        setCopiedAutoFillScript(true);
                        setTimeout(() => setCopiedAutoFillScript(false), 2000);
                      }}
                      title="Drag to your Bookmarks Bar, or click to copy the Universal Auto-Fill Script"
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-emerald-500/40 text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5 cursor-grab whitespace-nowrap"
                    >
                      <Bookmark className="w-3.5 h-3.5 text-emerald-400" />
                      <span>synOUT Auto-Fill</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        void copyTextToClipboard(autoFillScript);
                        setCopiedAutoFillScript(true);
                        setTimeout(() => setCopiedAutoFillScript(false), 2000);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      {copiedAutoFillScript ? (
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

                    {onOpenWebFormWorkbench && (
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateProfile(effectiveProfile);
                          onClose();
                          onOpenWebFormWorkbench();
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <FileCode2 className="w-3.5 h-3.5" />
                        <span>Open Opt-Out Page Finder</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/80 border border-slate-800 rounded-xl bg-slate-900/60">
                  {portalPrimaryTargets.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No web-form targets in current filter scope.
                    </div>
                  ) : (
                    portalPrimaryTargets.map((item) => {
                      const existingScan = scanResults.find((r) => r.brokerId === item.brokerId);
                      const alreadyLogged =
                        Boolean(loggedWebFormIds[item.id]) ||
                        (existingScan ? hasWebFormSubmission(existingScan) : false);

                      return (
                        <div
                          key={`wf-${item.id}`}
                          className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-white">{item.name}</span>
                              <span className="text-slate-600">·</span>
                              <span className="font-mono text-slate-400">{item.domain}</span>
                              {item.brokerRef && (
                                <>
                                  <span className="text-slate-600">·</span>
                                  <span className="text-amber-300">{item.brokerRef.removalMethod}</span>
                                </>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 truncate">
                              {item.optOutUrl}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {item.brokerRef && onOpenWebFormWorkbench && (
                              <button
                                type="button"
                                onClick={() => {
                                  onUpdateProfile(effectiveProfile);
                                  onClose();
                                  onOpenWebFormWorkbench(item.brokerRef);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-emerald-500/30 text-emerald-300 font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              >
                                <FileCode2 className="w-3 h-3" />
                                <span>Spider &amp; Fill</span>
                              </button>
                            )}

                            <a
                              href={item.optOutUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              <span>Open Portal</span>
                              <ExternalLink className="w-3 h-3 text-emerald-400" />
                            </a>

                            {item.brokerRef && onBrokerWebFormLogged && (
                              <button
                                type="button"
                                onClick={() => {
                                  onUpdateProfile(effectiveProfile);
                                  onBrokerWebFormLogged(item.brokerRef!, item.optOutUrl);
                                  setLoggedWebFormIds((prev) => ({ ...prev, [item.id]: true }));
                                }}
                                className={`px-2.5 py-1.5 rounded-lg font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                                  alreadyLogged
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                                }`}
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>{alreadyLogged ? 'Form Logged' : 'Log Form Sent'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 4. Queued Targets & Per-Target DPO Override / Portal Fallback Table */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs tabular-nums">
              <span className="font-bold text-slate-200">
                Queued Data Brokers, Websites &amp; Clearinghouses ({targets.length})
              </span>
              <span className="text-slate-400">
                Click Edit DPO to override any recipient or Portal for manual web opt-out
              </span>
            </div>

            <div className="max-h-64 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl divide-y divide-slate-800/80">
              {targets.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  All selected targets have already received opt-out demands. Check &ldquo;Include
                  targets that already received an opt-out notice&rdquo; above to force a fresh
                  mass re-send.
                </div>
              ) : (
                targets.map((item) => {
                  const exec = executionResults[item.id];
                  const mx = mxResults[item.id];
                  const isEditingThis = editingTargetId === item.id;

                  return (
                    <div key={item.id} className="p-3 space-y-2 text-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-white">{item.name}</span>
                            <span aria-hidden="true" className="text-slate-600">
                              ·
                            </span>
                            <span className="text-slate-400">{item.categoryLabel}</span>
                            <span aria-hidden="true" className="text-slate-600">
                              ·
                            </span>
                            <span
                              className={
                                item.requiresPortalWarning ? 'text-amber-400' : 'text-emerald-400'
                              }
                            >
                              {item.deliverabilityLabel}
                            </span>
                          </div>
                          <div className="font-mono text-[11px] text-slate-300 flex flex-wrap items-center gap-2">
                            <span>To: {exec?.deliveredTo || item.recipientEmail}</span>
                            {ccBackupDpo && item.recommendedCcEmails.length > 0 && (
                              <>
                                <span className="text-slate-600">·</span>
                                <span className="text-sky-400">
                                  CC: {item.recommendedCcEmails.join(', ')}
                                </span>
                              </>
                            )}
                            {mx && (
                              <>
                                <span className="text-slate-600">·</span>
                                <span className={mx.mxVerified ? 'text-emerald-400' : 'text-rose-400'}>
                                  {mx.mxVerified ? 'MX Verified' : 'No MX — Use Portal'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {exec?.state === 'sent' && (
                            <span className="text-emerald-400 font-semibold inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Sent</span>
                            </span>
                          )}
                          {exec?.state === 'rerouted' && (
                            <span className="text-amber-300 font-semibold inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Rerouted Backup DPO</span>
                            </span>
                          )}
                          {exec?.state === 'failed' && (
                            <span className="text-rose-400 font-semibold inline-flex items-center gap-1">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>Use Portal</span>
                            </span>
                          )}

                          {item.brokerId && (
                            <button
                              type="button"
                              onClick={() => {
                                if (isEditingThis) {
                                  setEditingTargetId(null);
                                } else {
                                  setEditingTargetId(item.id);
                                  setOverrideInput(item.recipientEmail);
                                  setOverrideError(null);
                                }
                              }}
                              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            >
                              <Edit3 className="w-3 h-3 text-sky-400" />
                              <span>Edit DPO</span>
                            </button>
                          )}

                          {item.brokerRef && onOpenWebFormWorkbench && (
                            <button
                              type="button"
                              onClick={() => {
                                onUpdateProfile(effectiveProfile);
                                onClose();
                                onOpenWebFormWorkbench(item.brokerRef);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-emerald-300 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              title="Find Opt-Out Page & Auto-Fill Web Form"
                            >
                              <FileCode2 className="w-3 h-3 text-emerald-400" />
                              <span>Form</span>
                            </button>
                          )}

                          <a
                            href={item.optOutUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <span>Portal</span>
                            <ExternalLink className="w-3 h-3 text-amber-400" />
                          </a>
                        </div>
                      </div>

                      {exec?.error && (
                        <p className="text-[11px] text-rose-400">{exec.error}</p>
                      )}

                      {isEditingThis && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                          <input
                            type="email"
                            value={overrideInput}
                            onChange={(e) => setOverrideInput(e.target.value)}
                            placeholder="privacy@broker.com"
                            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500/60"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveTargetOverride(item)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold cursor-pointer whitespace-nowrap"
                          >
                            Save DPO
                          </button>
                          {overrideError && (
                            <span className="text-rose-400 text-[11px]">{overrideError}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
