import React, { useState } from 'react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import { getBrokerRecordSearchUrl } from '../utils/scanEngine';
import { buildUniversalAutoFillScript } from '../utils/optOutFormEngine';
import { copyTextToClipboard } from '../utils/exportEngines';
import {
  type ClientRemovalWorkflowJob,
  approveAndSubmitWorkflowClient,
  completeWorkflowEmailVerificationClient,
  recheckWorkflowRemovalClient,
  recordManualHandoffClient,
  startWorkflowClient,
} from '../services/optOutDiscoveryClient';
import {
  Globe,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  X,
  Play,
  RotateCcw,
  Check,
  FileCheck,
  Bot,
  Copy,
  Send,
  Link2,
  Mail,
} from 'lucide-react';

interface AutomatedRemovalNavigatorProps {
  broker: DataBroker;
  result: ScanResult;
  profile: UserProfile;
  onClose: () => void;
  onExecutionComplete: (
    brokerId: string,
    confirmationCode: string | null,
    receiptData: {
      job: ClientRemovalWorkflowJob;
      internalSubmissionId: string;
      brokerConfirmationCode: string | null;
      verifiedRemoved: boolean;
    }
  ) => void;
  onOpenPowerOfAttorney: () => void;
  onSwitchToEmailOptOut?: (brokerId: string) => void;
}

function formatWorkflowStateLabel(state?: string): string {
  switch (state) {
    case 'ready_to_submit':
      return 'Ready for Approval';
    case 'awaiting_user_input':
      return 'Waiting for Your Choice';
    case 'awaiting_email_verification':
      return 'Waiting for Email Confirmation Link';
    case 'awaiting_broker_processing':
      return 'Submitted · Broker Processing';
    case 'submitted_unconfirmed':
      return 'Submitted (Unconfirmed)';
    case 'removal_verified':
      return 'Removal Verified';
    case 'blocked':
      return 'Needs Quick Human Step';
    case 'failed':
      return 'Could Not Submit Form';
    default:
      return state ? state.replace(/_/g, ' ') : 'Ready';
  }
}

function formatWorkflowStepAction(action: string): string {
  const map: Record<string, string> = {
    OPEN_PORTAL: 'Opened Broker Opt-Out Page',
    NAVIGATE_PORTAL: 'Loaded Opt-Out Page',
    DISCOVER_OPTOUT_LINK: 'Found Disguised Opt-Out Link',
    ADAPTER_PRE_STEP: 'Ran Broker Playbook Step',
    INSPECT_DOM_FIELDS: 'Mapped Form Fields & Checkboxes',
    INSPECTION_READY_FOR_REVIEW: 'Prepared Fields & Boxes for Review',
    SELECT_CANDIDATE_RECORD: 'Matched Your Record & Checked Box',
    AMBIGUOUS_CANDIDATE_PAUSE: 'Paused: Confirm Which Listing Is Yours',
    ADVANCE_WIZARD_STEP: 'Moved to Next Form Step',
    POPULATE_AND_SUBMIT_FORM: 'Filled Fields, Checked Boxes & Submitted',
    FORM_SUBMITTED_AWAITING_EMAIL: 'Submitted · Confirmation Email Sent to You',
    FORM_SUBMITTED_CONFIRMED: 'Submitted · Broker Issued Confirmation Code',
    FORM_SUBMITTED_ACKNOWLEDGED: 'Submitted · Broker Received Request',
    FORM_VALIDATION_FAILED: 'Broker Form Returned an Error',
    ANTIBOT_CHALLENGE_PAUSE: 'Paused: Security Check (CAPTCHA) Detected',
    EXCESSIVE_ID_DEMAND_PAUSE: 'Paused: Protected Your SSN / Gov ID',
    WORKER_UNAVAILABLE_FALLBACK: 'Switched to 1-Click Browser Auto-Fill',
    USER_COMPLETED_HUMAN_HANDOFF: 'Logged Your Manual Completion',
    EMAIL_VERIFICATION_CONFIRMED: 'Completed Email Confirmation Link',
    EMAIL_VERIFICATION_FAILED: 'Confirmation Link Expired or Invalid',
    RECHECK_LISTING_STILL_PRESENT: 'Checked Listing: Still Processing Removal',
    RECHECK_BLOCKED_BY_ANTIBOT: 'Recheck Paused by Security Gate',
    REMOVAL_VERIFIED_HTTP_404_410: 'Verified Removed (Page Gone)',
    REMOVAL_VERIFIED_CLEAN: 'Verified Removed from Public Results',
    WORKFLOW_CANCELLED: 'Cancelled Removal Run',
  };

  if (map[action]) return map[action];
  return action
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const AutomatedRemovalNavigator: React.FC<AutomatedRemovalNavigatorProps> = ({
  broker,
  result,
  profile,
  onClose,
  onExecutionComplete,
  onOpenPowerOfAttorney,
  onSwitchToEmailOptOut,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [job, setJob] = useState<ClientRemovalWorkflowJob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldOverrides, setFieldOverrides] = useState<Record<string, string>>({});
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [verificationUrl, setVerificationUrl] = useState('');
  const [handoffCode, setHandoffCode] = useState('');
  const [copiedScript, setCopiedScript] = useState(false);

  const poa = profile.powerOfAttorney;
  const entryOfRecordsUrl = getBrokerRecordSearchUrl(broker, profile);
  const senderEmail = profile.emails.find((e) => Boolean(e && e.trim())) || '';

  const applyJobUpdate = (updated: ClientRemovalWorkflowJob) => {
    setJob(updated);
    const nextOverrides: Record<string, string> = {};
    for (const f of updated.mappedFields) {
      if (!f.preserveOriginalHidden && f.disclosureAllowed) {
        nextOverrides[f.fieldKey] = f.plannedValue;
      }
    }
    setFieldOverrides(nextOverrides);
    if (updated.selectedCandidateId) {
      setSelectedCandidateId(updated.selectedCandidateId);
    } else {
      const eligible = updated.candidateRecords.find((c) => !c.disqualifiedHomonym);
      if (eligible) setSelectedCandidateId(eligible.candidateId);
    }

    const isSubmittedOrVerified =
      updated.state === 'awaiting_broker_processing' ||
      updated.state === 'awaiting_email_verification' ||
      updated.state === 'submitted_unconfirmed' ||
      updated.state === 'removal_verified';

    if (isSubmittedOrVerified) {
      onExecutionComplete(broker.id, updated.brokerConfirmationCode, {
        job: updated,
        internalSubmissionId: updated.internalSubmissionId,
        brokerConfirmationCode: updated.brokerConfirmationCode,
        verifiedRemoved: updated.state === 'removal_verified',
      });
    }
  };

  const handleRunWorkflow = async (mode: 'inspect_and_preview' | 'autonomous_auto_submit') => {
    setIsRunning(true);
    setErrorMessage(null);
    try {
      const executed = await startWorkflowClient({
        broker,
        brokerId: broker.id,
        brokerName: broker.name,
        brokerDomain: broker.domain,
        targetUrl: broker.optOutUrl,
        profile,
        senderEmail: senderEmail || undefined,
        mode,
      });
      applyJobUpdate(executed);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Automatic form runner is temporarily unavailable — use the 1-Click Auto-Fill Script or Legal Email option below.'
      );
    } finally {
      setIsRunning(false);
    }
  };

  const handleApproveAndSubmit = async () => {
    if (!job) return;
    setIsRunning(true);
    setErrorMessage(null);
    try {
      const executed = await approveAndSubmitWorkflowClient({
        jobId: job.jobId,
        fieldOverrides,
        selectedCandidateId: selectedCandidateId || undefined,
      });
      applyJobUpdate(executed);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Approval & submission failed.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleVerifyEmailLink = async () => {
    if (!job || !verificationUrl.trim()) return;
    setIsRunning(true);
    setErrorMessage(null);
    try {
      const executed = await completeWorkflowEmailVerificationClient({
        jobId: job.jobId,
        verificationUrl: verificationUrl.trim(),
      });
      applyJobUpdate(executed);
      setVerificationUrl('');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Email confirmation link check failed.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleRecheckRemoval = async () => {
    if (!job) return;
    setIsRunning(true);
    setErrorMessage(null);
    try {
      const executed = await recheckWorkflowRemovalClient({ jobId: job.jobId });
      applyJobUpdate(executed);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Live re-verification failed.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleConfirmManualHandoff = async () => {
    if (!job) return;
    setIsRunning(true);
    setErrorMessage(null);
    try {
      const executed = await recordManualHandoffClient({
        jobId: job.jobId,
        userProvidedConfirmationCode: handoffCode.trim() || undefined,
      });
      applyJobUpdate(executed);
      setHandoffCode('');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not record manual handoff.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopyBookmarkletScript = () => {
    const script = buildUniversalAutoFillScript(profile, senderEmail, broker);
    void copyTextToClipboard(script);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const isSubmitted =
    job?.state === 'awaiting_broker_processing' ||
    job?.state === 'awaiting_email_verification' ||
    job?.state === 'submitted_unconfirmed' ||
    job?.state === 'removal_verified' ||
    result.removalStatus === 'removed';

  const visibleMappedFields = job
    ? job.mappedFields.filter((f) => !f.preserveOriginalHidden && f.disclosureAllowed)
    : [];
  const eligibleCandidates = job
    ? job.candidateRecords.filter((c) => !c.disqualifiedHomonym)
    : [];
  const disqualifiedHomonymCount = job
    ? job.candidateRecords.filter((c) => c.disqualifiedHomonym).length
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-3xl glass-popover rounded-3xl p-6 sm:p-8 space-y-5 my-8">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/[0.08] pb-4 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center text-sky-400 shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Automatic Web-Form Removal Assistant
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Opens <strong className="text-slate-200">{broker.name}</strong> ({broker.domain}),
                fills in your details, checks required consent &amp; removal boxes on your behalf,
                and submits.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* URLs Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 glass-subtle rounded-2xl text-xs">
          <div>
            <div className="text-[11px] text-slate-400 font-semibold mb-1 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              <span>Record Search Page</span>
            </div>
            <a
              href={entryOfRecordsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 hover:text-sky-300 underline font-mono text-[11px] flex items-center gap-1 truncate"
            >
              <span className="truncate">{entryOfRecordsUrl}</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>

          <div>
            <div className="text-[11px] text-slate-400 font-semibold mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Official Opt-Out Form</span>
            </div>
            <a
              href={broker.optOutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:text-emerald-300 underline font-mono text-[11px] flex items-center gap-1 truncate"
            >
              <span className="truncate">{broker.optOutUrl}</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>
        </div>

        {/* Power of Attorney Status + Optional Email Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 rounded-2xl glass-subtle text-xs">
          <div className="flex items-center gap-2">
            <FileCheck
              className={`w-4 h-4 shrink-0 ${poa?.isSigned ? 'text-emerald-400' : 'text-amber-400'}`}
            />
            <span>
              <strong>Authorized Agent Form:</strong>{' '}
              {poa?.isSigned ? (
                <span className="text-emerald-300 font-medium">
                  Signed &amp; Active ({poa.authCode})
                </span>
              ) : (
                <span className="text-slate-300">
                  Optional — lets synOUT act as your authorized representative
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!poa?.isSigned && (
              <button
                type="button"
                onClick={onOpenPowerOfAttorney}
                className="px-2.5 py-1 text-[11px] font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                Sign Authorization
              </button>
            )}
            {broker.privacyEmail && onSwitchToEmailOptOut && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSwitchToEmailOptOut(broker.id);
                }}
                className="px-2.5 py-1 text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Mail className="w-3 h-3" />
                <span>Or Remove via Email</span>
              </button>
            )}
          </div>
        </div>

        {errorMessage && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Step-by-Step Plain-English Progress */}
        <div className="glass-subtle rounded-2xl p-4 text-xs text-slate-300 space-y-2 max-h-48 overflow-y-auto">
          <div className="text-slate-400 text-[11px] border-b border-white/[0.08] pb-2 mb-1 flex items-center justify-between">
            <span className="font-semibold text-slate-300">What synOUT Is Doing For You</span>
            <span className="text-emerald-400 font-medium">
              {job ? formatWorkflowStateLabel(job.state) : 'Ready'}
            </span>
          </div>
          {!job || job.steps.length === 0 ? (
            <div className="text-slate-400 py-3 text-center leading-relaxed">
              Click <strong className="text-white">Auto-Fill &amp; Submit Form</strong> below so
              synOUT fills out the form and checks required boxes for you — or click{' '}
              <strong className="text-white">Preview First</strong> to inspect every field and
              checkbox before submitting.
            </div>
          ) : (
            <div className="space-y-1.5 tabular-nums">
              {job.steps.map((step) => (
                <div key={step.stepIndex} className="leading-relaxed flex items-start gap-2">
                  <span className="text-emerald-400 font-mono select-none shrink-0">
                    {step.stepIndex}.
                  </span>
                  <span>
                    <strong className="text-white">{formatWorkflowStepAction(step.action)}</strong>{' '}
                    <span className="text-slate-400">— {step.details}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Blocker Handoff (CAPTCHA / Security Gate) */}
        {job?.blocker && job.blocker.kind !== 'ambiguous_record_match' && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-3 text-xs">
            <div className="font-bold text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Quick Human Step Needed (Security Check)</span>
            </div>
            <p className="text-amber-100/90 leading-relaxed">{job.blocker.summary}</p>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={job.blocker.handoffUrl || broker.optOutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold inline-flex items-center gap-1 whitespace-nowrap"
              >
                <span>Open Opt-Out Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={handleCopyBookmarkletScript}
                className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedScript ? 'Copied Auto-Fill Script' : 'Copy Auto-Fill Script'}</span>
              </button>
              {broker.privacyEmail && onSwitchToEmailOptOut && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSwitchToEmailOptOut(broker.id);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Send Legal Removal Email Instead</span>
                </button>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <input
                type="text"
                value={handoffCode}
                onChange={(e) => setHandoffCode(e.target.value)}
                placeholder="Optional confirmation code shown after completing CAPTCHA"
                className="flex-1 glass-input rounded-lg px-3 py-1.5 text-white font-mono"
              />
              <button
                type="button"
                onClick={handleConfirmManualHandoff}
                disabled={isRunning}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold cursor-pointer whitespace-nowrap"
              >
                Mark Form Completed
              </button>
            </div>
          </div>
        )}

        {/* Candidate Record Selection + Preview Approval Controls */}
        {job &&
          (job.state === 'ready_to_submit' || job.state === 'awaiting_user_input') &&
          (visibleMappedFields.length > 0 || eligibleCandidates.length > 0) && (
            <div className="p-4 glass-subtle rounded-2xl space-y-4 text-xs">
              {/* Candidate Record Picker when multiple or matched records exist */}
              {eligibleCandidates.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-white">
                      {eligibleCandidates.length > 1
                        ? `Choose Which Listing Is Yours (${eligibleCandidates.length} Matches Found)`
                        : 'Matched Record Selected For Removal'}
                    </span>
                    {disqualifiedHomonymCount > 0 && (
                      <span className="text-[11px] text-emerald-400 tabular-nums">
                        Skipped {disqualifiedHomonymCount} wrong-state/age namesake
                        {disqualifiedHomonymCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Check the record that belongs to you — synOUT will check that box on{' '}
                    {broker.name}&apos;s page and finish submitting your removal.
                  </p>
                  <div className="space-y-2 max-h-44 overflow-y-auto">
                    {eligibleCandidates.map((cand) => {
                      const isSelected = selectedCandidateId === cand.candidateId;
                      return (
                        <label
                          key={cand.candidateId}
                          className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-emerald-500/10 border-emerald-400/40'
                              : 'bg-slate-950/50 border-white/[0.08] hover:border-white/20'
                          }`}
                        >
                          <input
                            type="radio"
                            name="synout-candidate-record"
                            checked={isSelected}
                            onChange={() => setSelectedCandidateId(cand.candidateId)}
                            className="mt-0.5 border-slate-600 bg-slate-950 text-emerald-500 cursor-pointer shrink-0"
                          />
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-white">
                                {cand.fullName}
                                {cand.age ? ` · Age ${cand.age}` : ''}
                              </span>
                              <span className="text-[11px] font-mono text-emerald-400 tabular-nums">
                                {Math.round(cand.confidenceScore * 100)}% Match
                              </span>
                            </div>
                            {cand.locations.length > 0 && (
                              <div className="text-[11px] text-slate-300">
                                Locations: {cand.locations.join(' · ')}
                              </div>
                            )}
                            {cand.relatives.length > 0 && (
                              <div className="text-[11px] text-slate-400">
                                Relatives: {cand.relatives.join(', ')}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Mapped Fields & Checkboxes */}
              {visibleMappedFields.length > 0 && (
                <div className="space-y-2.5">
                  <div className="font-bold text-white tabular-nums">
                    Fields &amp; Checkboxes Prepared For You ({visibleMappedFields.length} Ready)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto">
                    {visibleMappedFields.map((f) => {
                      const isCheck =
                        f.inputType === 'checkbox' || f.tag === 'custom_checkbox';
                      const currentVal = fieldOverrides[f.fieldKey] ?? f.plannedValue;
                      const isChecked =
                        Boolean(currentVal) &&
                        !/^(false|0|no|off|__unchecked__)$/i.test(currentVal);

                      if (isCheck) {
                        return (
                          <label
                            key={f.fieldKey}
                            className="p-2.5 glass-input rounded-lg flex items-start gap-2.5 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) =>
                                setFieldOverrides((prev) => ({
                                  ...prev,
                                  [f.fieldKey]: e.target.checked
                                    ? f.plannedValue &&
                                      !/^(false|0|no|off|__unchecked__)$/i.test(f.plannedValue)
                                      ? f.plannedValue
                                      : 'true'
                                    : 'false',
                                }))
                              }
                              className="mt-0.5 rounded border-slate-600 bg-slate-950 text-emerald-500 cursor-pointer shrink-0"
                            />
                            <div className="min-w-0 space-y-0.5">
                              <span className="text-xs text-white font-medium block leading-snug">
                                {f.label || f.name}
                              </span>
                              <span className="text-[10px] text-emerald-400 block">
                                {isChecked ? 'Checked for you by synOUT' : 'Unchecked'}
                              </span>
                            </div>
                          </label>
                        );
                      }

                      return (
                        <div key={f.fieldKey} className="space-y-1">
                          <span className="text-[11px] text-slate-400 block truncate tabular-nums">
                            {f.label || f.name}
                          </span>
                          <input
                            type="text"
                            value={currentVal}
                            onChange={(e) =>
                              setFieldOverrides((prev) => ({
                                ...prev,
                                [f.fieldKey]: e.target.value,
                              }))
                            }
                            className="w-full glass-input rounded-lg px-2.5 py-1.5 text-white font-mono"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleApproveAndSubmit}
                  disabled={isRunning || (eligibleCandidates.length > 1 && !selectedCandidateId)}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-extrabold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {eligibleCandidates.length > 0 && visibleMappedFields.length === 0
                      ? 'Confirm Record & Continue Auto-Removal'
                      : 'Approve & Submit Form'}
                  </span>
                </button>
              </div>
            </div>
          )}

        {/* Submission Evidence Summary */}
        {job && isSubmitted && (
          <div className="p-4 glass-subtle border-emerald-500/30 rounded-2xl space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{formatWorkflowStateLabel(job.state)}</span>
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                Reference: {job.internalSubmissionId}
              </span>
            </div>
            <div className="font-mono text-slate-200">
              Broker Confirmation Code:{' '}
              <strong>{job.brokerConfirmationCode || 'None issued by broker'}</strong>
            </div>
            {job.evidence && (
              <div className="font-mono text-[11px] text-slate-400 truncate">
                Receipt Hash: {job.evidence.evidenceManifestSha256}
              </div>
            )}

            {job.state === 'awaiting_email_verification' && (
              <div className="pt-2 space-y-1.5">
                <p className="text-[11px] text-slate-300">
                  {broker.name} emailed you a confirmation link. Paste that link below and synOUT
                  will click it &amp; check any final confirmation boxes for you:
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={verificationUrl}
                    onChange={(e) => setVerificationUrl(e.target.value)}
                    placeholder={`Paste confirmation link from ${broker.domain} email...`}
                    className="flex-1 glass-input rounded-lg px-3 py-1.5 text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyEmailLink}
                    disabled={isRunning || !verificationUrl.trim()}
                    className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Click &amp; Confirm Link For Me</span>
                  </button>
                </div>
              </div>
            )}

            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={handleRecheckRemoval}
                disabled={isRunning}
                className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-sky-300 font-semibold cursor-pointer whitespace-nowrap"
              >
                Check If Record Is Gone Now
              </button>
            </div>
          </div>
        )}

        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-white/[0.08]">
          <a
            href={entryOfRecordsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-300 glass-subtle hover:border-white/20 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Globe className="w-3.5 h-3.5 text-sky-400" />
            <span>Check Broker Page</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </a>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            >
              Close
            </button>

            {!isSubmitted ? (
              <>
                <button
                  type="button"
                  onClick={() => handleRunWorkflow('inspect_and_preview')}
                  disabled={isRunning}
                  className="px-4 py-2.5 text-xs font-semibold text-white bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] disabled:opacity-50 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                >
                  Preview First
                </button>
                <button
                  type="button"
                  onClick={() => handleRunWorkflow('autonomous_auto_submit')}
                  disabled={isRunning}
                  className="px-5 py-2.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-xl flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {isRunning ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                      <span>Filling &amp; Checking Boxes...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Auto-Fill &amp; Submit Form</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Check className="w-4 h-4" />
                <span>Done</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
