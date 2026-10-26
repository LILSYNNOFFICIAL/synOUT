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
}

function formatWorkflowStateLabel(state?: string): string {
  switch (state) {
    case 'ready_to_submit':
      return 'Ready for Approval';
    case 'awaiting_user_input':
      return 'Awaiting User Input';
    case 'awaiting_email_verification':
      return 'Awaiting Email Confirmation';
    case 'awaiting_broker_processing':
      return 'Submitted · Awaiting Processing';
    case 'submitted_unconfirmed':
      return 'Submitted (Unconfirmed)';
    case 'removal_verified':
      return 'Removal Verified';
    case 'blocked':
      return 'Human Handoff Needed';
    case 'failed':
      return 'Validation Failed';
    default:
      return state ? state.replace(/_/g, ' ') : 'Idle';
  }
}

export const AutomatedRemovalNavigator: React.FC<AutomatedRemovalNavigatorProps> = ({
  broker,
  result,
  profile,
  onClose,
  onExecutionComplete,
  onOpenPowerOfAttorney,
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
          : 'Headless browser execution unavailable; open the opt-out URL and use the Auto-Fill Script.'
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-3xl glass-popover rounded-3xl p-6 sm:p-8 space-y-5 my-8">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center text-sky-400 shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Autonomous Headless Opt-Out Navigator
              </h2>
              <p className="text-xs text-slate-400">
                Launches Playwright Chromium against{' '}
                <strong className="text-slate-200">{broker.name}</strong> ({broker.domain}) with
                SSRF protection and cryptographic submission evidence.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* URLs Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 glass-subtle rounded-2xl text-xs">
          <div>
            <div className="text-[11px] text-slate-400 font-semibold mb-1 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              <span>Record Search URL</span>
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
              <span>Official Opt-Out Portal</span>
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

        {/* Power of Attorney Status */}
        <div className="flex items-center justify-between px-4 py-3 rounded-2xl glass-subtle text-xs">
          <div className="flex items-center gap-2">
            <FileCheck
              className={`w-4 h-4 shrink-0 ${poa?.isSigned ? 'text-emerald-400' : 'text-amber-400'}`}
            />
            <span>
              <strong>Power of Attorney:</strong>{' '}
              {poa?.isSigned ? (
                <span className="text-emerald-300 font-medium">
                  Signed &amp; Active ({poa.authCode})
                </span>
              ) : (
                <span className="text-amber-300 font-medium">
                  Optional authorized-agent declaration unsigned
                </span>
              )}
            </span>
          </div>
          {!poa?.isSigned && (
            <button
              type="button"
              onClick={onOpenPowerOfAttorney}
              className="px-2.5 py-1 text-[11px] font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              Sign POA
            </button>
          )}
        </div>

        {errorMessage && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Real Execution Trace & Job Details */}
        <div className="glass-subtle rounded-2xl p-4 text-xs text-slate-300 space-y-2 max-h-48 overflow-y-auto">
          <div className="text-slate-400 text-[11px] border-b border-white/[0.08] pb-2 mb-1 flex items-center justify-between">
            <span className="font-semibold text-slate-300">Playwright Workflow Trace</span>
            <span className="text-emerald-400 font-medium">
              {job ? formatWorkflowStateLabel(job.state) : 'Idle'}
            </span>
          </div>
          {!job || job.steps.length === 0 ? (
            <div className="text-slate-400 py-3 text-center">
              Choose &ldquo;Inspect &amp; Preview&rdquo; or &ldquo;Autonomous Auto-Submit&rdquo; to
              start real browser execution.
            </div>
          ) : (
            <div className="font-mono space-y-1.5 tabular-nums">
              {job.steps.map((step) => (
                <div key={step.stepIndex} className="leading-relaxed flex items-start gap-2">
                  <span className="text-emerald-400 select-none">#{step.stepIndex}</span>
                  <span>
                    <strong className="text-white">{step.action}</strong> — {step.details}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Blocker Handoff */}
        {job?.blocker && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-3 text-xs">
            <div className="font-bold text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Human Handoff Required</span>
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
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <input
                type="text"
                value={handoffCode}
                onChange={(e) => setHandoffCode(e.target.value)}
                placeholder="Optional broker confirmation code shown after CAPTCHA"
                className="flex-1 glass-input rounded-lg px-3 py-1.5 text-white font-mono"
              />
              <button
                type="button"
                onClick={handleConfirmManualHandoff}
                disabled={isRunning}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold cursor-pointer whitespace-nowrap"
              >
                Record Manual Completion
              </button>
            </div>
          </div>
        )}

        {/* Preview Approval Controls */}
        {job &&
          (job.state === 'ready_to_submit' || job.state === 'awaiting_user_input') &&
          job.mappedFields.filter((f) => !f.preserveOriginalHidden).length > 0 && (
            <div className="p-4 glass-subtle rounded-2xl space-y-3 text-xs">
              <div className="font-bold text-white tabular-nums">
                Review Mapped Fields Before Submission (
                {job.mappedFields.filter((f) => !f.preserveOriginalHidden).length} Controls)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-44 overflow-y-auto">
                {job.mappedFields
                  .filter((f) => !f.preserveOriginalHidden && f.disclosureAllowed)
                  .map((f) => (
                    <div key={f.fieldKey} className="space-y-1">
                      <span className="text-[11px] text-slate-400 block truncate tabular-nums">
                        {f.label || f.name} ({Math.round(f.confidence * 100)}%)
                      </span>
                      <input
                        type="text"
                        value={fieldOverrides[f.fieldKey] ?? f.plannedValue}
                        onChange={(e) =>
                          setFieldOverrides((prev) => ({
                            ...prev,
                            [f.fieldKey]: e.target.value,
                          }))
                        }
                        className="w-full glass-input rounded-lg px-2.5 py-1.5 text-white font-mono"
                      />
                    </div>
                  ))}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleApproveAndSubmit}
                  disabled={isRunning}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Approve &amp; Submit Form</span>
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
                Internal ID: {job.internalSubmissionId}
              </span>
            </div>
            <div className="font-mono text-slate-200">
              Broker Confirmation Code:{' '}
              <strong>{job.brokerConfirmationCode || 'None issued by broker'}</strong>
            </div>
            {job.evidence && (
              <div className="font-mono text-[11px] text-slate-400 truncate">
                Evidence SHA-256: {job.evidence.evidenceManifestSha256}
              </div>
            )}

            {job.state === 'awaiting_email_verification' && (
              <div className="pt-2 flex flex-col sm:flex-row gap-2">
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
                  <span>Verify Link</span>
                </button>
              </div>
            )}

            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={handleRecheckRemoval}
                disabled={isRunning}
                className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-sky-300 font-semibold cursor-pointer whitespace-nowrap"
              >
                Re-Verify Live Listing Removal
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
            <span>Verify on Broker Site</span>
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
                  Inspect &amp; Preview
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
                      <span>Running Chromium...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Autonomous Auto-Submit</span>
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
