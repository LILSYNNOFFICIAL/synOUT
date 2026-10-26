import React, { useState, useMemo } from 'react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import {
  useEmailConnection,
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
import { buildWebmailComposeUrls } from '../utils/emailProviderConfig';
import { getBrokerRecordSearchUrl } from '../utils/scanEngine';
import { copyTextToClipboard } from '../utils/exportEngines';
import {
  X,
  Copy,
  Check,
  Send,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Mail,
  FileCheck,
  ExternalLink,
  ShieldCheck,
  Edit3,
  RotateCcw,
} from 'lucide-react';

type StatutePreset = 'CCPA' | 'TDPSA' | 'OMNIBUS' | 'GDPR';

interface LegalNoticeModalProps {
  broker: DataBroker;
  result: ScanResult;
  profile: UserProfile;
  onClose: () => void;
  onMarkSubmitted: (brokerId: string, confirmationCode?: string, silent?: boolean) => void;
  onOpenConnectEmail?: () => void;
  onOpenPowerOfAttorney?: () => void;
}

const STATUTE_META: Record<
  StatutePreset,
  { label: string; citation: string; deadline: string; subjectTag: string }
> = {
  CCPA: {
    label: 'CCPA / CPRA (CA)',
    citation:
      'California Consumer Privacy Act & California Privacy Rights Act (Cal. Civ. Code § 1798.105 & § 1798.120)',
    deadline: '45 calendar days',
    subjectTag: 'CCPA/CPRA',
  },
  TDPSA: {
    label: 'TDPSA (TX)',
    citation:
      'Texas Data Privacy and Security Act (Tex. Bus. & Com. Code § 541.051 et seq.)',
    deadline: '45 calendar days',
    subjectTag: 'TDPSA',
  },
  OMNIBUS: {
    label: 'US State Omnibus',
    citation:
      'Virginia VCDPA (§ 59.1-577), Colorado CPA (§ 6-1-1306), Connecticut CTDPA, and Applicable State Data Privacy Laws',
    deadline: '45 calendar days',
    subjectTag: 'State Statutory',
  },
  GDPR: {
    label: 'GDPR Art. 17',
    citation:
      'General Data Protection Regulation (EU) 2016/679 Article 17 (Right to Erasure) & Article 21 (Right to Object)',
    deadline: '30 calendar days',
    subjectTag: 'GDPR Art. 17',
  },
};

function draftStatutoryNotice(
  broker: DataBroker,
  recipientEmail: string,
  profile: UserProfile,
  statute: StatutePreset,
  senderEmail: string,
  includePoa: boolean
): { subject: string; body: string } {
  const meta = STATUTE_META[statute];
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const poa = profile.powerOfAttorney;
  const poaBlock =
    includePoa && poa?.isSigned
      ? `\nAUTHORIZED AGENT & POWER OF ATTORNEY DESIGNATION:
- Authorization Code: ${poa.authCode}
- Executed By: ${poa.fullName} (${poa.signedDate})
- Statutory Basis: CCPA § 1798.130 & Cal. Code Regs. tit. 11 § 7063\n`
      : '';

  const subject = `LEGAL NOTICE: Statutory ${meta.subjectTag} Data Deletion & Suppression Demand - ${fullName}`;
  const body = `DATE: ${dateStr}
TO: Privacy Officer / Compliance Department, ${broker.name} (${recipientEmail || broker.domain})
FROM: ${fullName} <${senderEmail}>
RE: FORMAL STATUTORY DATA SUPPRESSION & DELETION DEMAND (${meta.subjectTag})

Pursuant to the ${meta.citation}, I hereby exercise my statutory privacy rights to demand immediate deletion, opt-out of sale/sharing, and permanent suppression of all personal records relating to my identity across ${broker.name} (${broker.domain}) and all affiliated data syndicates:

IDENTIFYING INFORMATION FOR SUPPRESSION:
- Full Legal Name: ${fullName}
- Primary Residence: ${profile.currentCity}, ${profile.currentState} ${profile.currentZip || ''}
- Primary Phone: ${profile.phoneNumbers[0] || 'On record'}
- Primary Email: ${senderEmail}
- Indexed Record Reference: ${getBrokerRecordSearchUrl(broker, profile)}
- Exposed Data Categories: ${broker.dataExposedList.join(', ')}
${poaBlock}
MANDATORY COMPLIANCE DIRECTIVES:
1. Permanently delete all consumer dossiers, telephone/address histories, and marketing profiles tied to the identifiers above.
2. Direct all downstream data buyers, affiliates, and sub-processors to purge these records.
3. Add my identifying attributes to your internal suppression list so my profile is not re-acquired from future public record or commercial feeds.
4. Provide written confirmation of completion to ${senderEmail} within ${meta.deadline}.

Sincerely,
${fullName}
Data Subject & Consumer`;

  return { subject, body };
}

export const LegalNoticeModal: React.FC<LegalNoticeModalProps> = ({
  broker,
  profile,
  onClose,
  onMarkSubmitted,
  onOpenConnectEmail,
  onOpenPowerOfAttorney,
}) => {
  const { isDirectSendConnected, activeConnectedEmail } = useEmailConnection();
  const overrides = useBrokerContactOverrides();
  const contact = useMemo(
    () => resolveBrokerContactProfile(broker, overrides),
    [broker, overrides]
  );

  const initialStatute: StatutePreset = profile.currentState === 'TX' ? 'TDPSA' : 'CCPA';
  const effectiveSender = activeConnectedEmail || profile.emails[0] || 'consumer@example.com';

  const [selectedStatute, setSelectedStatute] = useState<StatutePreset>(initialStatute);
  const [includePoa, setIncludePoa] = useState<boolean>(Boolean(profile.powerOfAttorney?.isSigned));
  const [bccSelf, setBccSelf] = useState<boolean>(true);
  const [ccBackupDpo, setCcBackupDpo] = useState<boolean>(true);
  const [copied, setCopied] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentReceipt, setSentReceipt] = useState<string | null>(null);
  const [deliveredToEmail, setDeliveredToEmail] = useState<string | null>(null);

  // Editable recipient & MX check state
  const [isEditingRecipient, setIsEditingRecipient] = useState(false);
  const [draftRecipient, setDraftRecipient] = useState(contact.effectivePrimaryEmail);
  const [isCheckingMx, setIsCheckingMx] = useState(false);
  const [mxCheck, setMxCheck] = useState<RecipientDeliverabilityVerification | null>(null);

  const initialDraft = draftStatutoryNotice(
    broker,
    contact.effectivePrimaryEmail,
    profile,
    initialStatute,
    effectiveSender,
    Boolean(profile.powerOfAttorney?.isSigned)
  );

  const [subjectLine, setSubjectLine] = useState<string>(initialDraft.subject);
  const [letterContent, setLetterContent] = useState<string>(initialDraft.body);

  const refreshDraftRecipient = (nextEmail: string, statute = selectedStatute, poa = includePoa) => {
    const updated = draftStatutoryNotice(broker, nextEmail, profile, statute, effectiveSender, poa);
    setSubjectLine(updated.subject);
    setLetterContent(updated.body);
  };

  const handleSelectStatute = (statute: StatutePreset) => {
    setSelectedStatute(statute);
    refreshDraftRecipient(contact.effectivePrimaryEmail, statute, includePoa);
  };

  const handleTogglePoa = (checked: boolean) => {
    setIncludePoa(checked);
    refreshDraftRecipient(contact.effectivePrimaryEmail, selectedStatute, checked);
  };

  const handleCopy = () => {
    void copyTextToClipboard(`${subjectLine}\n\n${letterContent}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerifyMx = async () => {
    if (!contact.effectivePrimaryEmail) return;
    setIsCheckingMx(true);
    setSendError(null);
    try {
      const report = await verifyRecipientDeliverabilityClient(
        contact.effectivePrimaryEmail,
        contact.fallbackEmails
      );
      setMxCheck(report);
      if (report.valid && report.usedFallback && report.recommendedEmail) {
        markBrokerEmailBounced(broker.id, contact.effectivePrimaryEmail);
        refreshDraftRecipient(report.recommendedEmail);
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'MX lookup failed.');
    } finally {
      setIsCheckingMx(false);
    }
  };

  const handleSaveRecipientOverride = () => {
    const clean = draftRecipient.trim().toLowerCase();
    if (!isValidEmailSyntax(clean)) {
      setSendError('Enter a valid compliance email address.');
      return;
    }
    setBrokerCustomEmail(broker.id, clean);
    setIsEditingRecipient(false);
    setMxCheck(null);
    setSendError(null);
    refreshDraftRecipient(clean);
  };

  const handleConfirmedSend = async () => {
    if (!contact.effectivePrimaryEmail) {
      setSendError('This broker does not list a public privacy email.');
      return;
    }
    setIsSending(true);
    setSendError(null);
    try {
      const res = await sendEmailViaConnectedAccount({
        recipientEmail: contact.effectivePrimaryEmail,
        fallbackRecipientEmails: contact.fallbackEmails,
        ccEmails: ccBackupDpo ? contact.recommendedCcEmails : [],
        subject: subjectLine,
        body: letterContent,
        senderName: `${profile.firstName} ${profile.lastName}`.trim() || 'Authorized Consumer',
        brokerId: broker.id,
        brokerName: broker.name,
        brokerDomain: broker.domain,
        bccSelf,
      });
      if (res.usedFallback) {
        markBrokerEmailBounced(broker.id, contact.effectivePrimaryEmail);
      }
      setSentReceipt(res.messageId);
      setDeliveredToEmail(res.deliveredTo || contact.effectivePrimaryEmail);
      setConfirmStep(false);
      onMarkSubmitted(broker.id, res.messageId, false);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send deletion notice.');
    } finally {
      setIsSending(false);
    }
  };

  const webmailLinks = contact.effectivePrimaryEmail
    ? buildWebmailComposeUrls(contact.effectivePrimaryEmail, subjectLine, letterContent)
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="glass-popover rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-5 relative my-8">
        <div className="flex items-start justify-between pb-4 border-b border-white/[0.08]">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="text-emerald-400 font-medium">Statutory Deletion Notice</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{broker.domain}</span>
              <span aria-hidden="true">·</span>
              <span>{contact.deliverabilityLabel}</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Custom Deletion Letter: {broker.name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Recipient Deliverability & Override Control Bar */}
        <div className="p-4 glass-subtle rounded-2xl space-y-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-mono flex flex-wrap items-center gap-1.5 min-w-0">
              <span className="text-slate-400">To:</span>
              <span className="text-emerald-400 font-semibold break-all">
                {contact.effectivePrimaryEmail || 'Portal Only'}
              </span>
              {activeConnectedEmail && (
                <>
                  <span aria-hidden="true" className="text-slate-600">
                    ·
                  </span>
                  <span className="text-slate-300">From: {activeConnectedEmail}</span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {contact.effectivePrimaryEmail && (
                <button
                  type="button"
                  onClick={handleVerifyMx}
                  disabled={isCheckingMx}
                  className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-emerald-300 font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {isCheckingMx ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-3 h-3" />
                  )}
                  <span>{isCheckingMx ? 'Checking...' : 'Check MX'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setDraftRecipient(contact.effectivePrimaryEmail);
                  setIsEditingRecipient((v) => !v);
                }}
                className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-300 hover:text-white inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Edit3 className="w-3 h-3" />
                <span>{isEditingRecipient ? 'Close' : 'Edit Recipient'}</span>
              </button>

              <a
                href={broker.optOutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-300 hover:text-white inline-flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                <span>Web Portal</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {mxCheck && (
            <div
              className={`text-[11px] font-mono ${
                mxCheck.valid ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {mxCheck.valid
                ? `DNS MX Verified: ${mxCheck.mxHosts[0] || broker.domain}${
                    mxCheck.usedFallback
                      ? ` (auto-switched to ${mxCheck.recommendedEmail})`
                      : ''
                  }`
                : mxCheck.reason ||
                  'No active mail exchanger found — use the Web Portal button above.'}
            </div>
          )}

          {contact.requiresPortalWarning && (
            <p className="text-[11px] text-amber-300/90 leading-relaxed">
              Deliverability note: {broker.name} primarily processes removals via its interactive
              web portal. Sending this statutory email establishes a dated legal record, and
              completing the Web Portal ensures immediate directory suppression.
            </p>
          )}

          {isEditingRecipient && (
            <div className="pt-2.5 border-t border-white/[0.08] space-y-2">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="email"
                  value={draftRecipient}
                  onChange={(e) => setDraftRecipient(e.target.value)}
                  placeholder="privacy@broker.com"
                  className="flex-1 glass-input rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSaveRecipientOverride}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold cursor-pointer whitespace-nowrap"
                  >
                    Save Override
                  </button>
                  {(contact.hasCustomOverride || contact.bouncedEmails.length > 0) && (
                    <button
                      type="button"
                      onClick={() => {
                        resetBrokerContactOverride(broker.id);
                        setIsEditingRecipient(false);
                        refreshDraftRecipient(broker.privacyEmail);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              </div>

              {contact.allValidCandidates.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-slate-400">Verified alternatives:</span>
                  {contact.allValidCandidates.map((cand) => (
                    <button
                      key={cand}
                      type="button"
                      onClick={() => {
                        setBrokerCustomEmail(broker.id, cand);
                        setIsEditingRecipient(false);
                        refreshDraftRecipient(cand);
                      }}
                      className="px-2 py-0.5 rounded-md bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] font-mono text-emerald-300 cursor-pointer"
                    >
                      {cand}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Statute Switcher + Copy Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 glass-subtle rounded-xl">
            {(Object.keys(STATUTE_META) as StatutePreset[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectStatute(key)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  selectedStatute === key
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {STATUTE_META[key].label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="px-3.5 py-1.5 rounded-xl glass-subtle hover:border-white/20 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copied ? 'Copied' : 'Copy Notice'}</span>
          </button>
        </div>

        {/* Power of Attorney Attachment Bar */}
        <div className="px-4 py-3 glass-subtle rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
          {profile.powerOfAttorney?.isSigned ? (
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includePoa}
                onChange={(e) => handleTogglePoa(e.target.checked)}
                className="rounded border-white/20 bg-slate-950/60 text-emerald-500 focus:ring-0 cursor-pointer"
              />
              <span>
                Include signed Power of Attorney clause (
                <span className="font-mono text-emerald-400">
                  {profile.powerOfAttorney.authCode}
                </span>
                )
              </span>
            </label>
          ) : (
            <div className="flex flex-wrap items-center justify-between w-full gap-2">
              <span className="text-slate-400">
                Optional: Attach a signed Limited Power of Attorney designation (CCPA § 1798.130).
              </span>
              {onOpenPowerOfAttorney && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenPowerOfAttorney();
                  }}
                  className="text-emerald-400 hover:text-emerald-300 font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>Sign POA</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <input
            type="text"
            value={subjectLine}
            onChange={(e) => setSubjectLine(e.target.value)}
            className="w-full glass-input rounded-xl px-3.5 py-2 text-xs text-white font-mono"
          />
          <textarea
            rows={10}
            value={letterContent}
            onChange={(e) => setLetterContent(e.target.value)}
            className="w-full p-4 glass-input rounded-xl font-mono text-xs text-slate-200 leading-relaxed resize-y"
          />
        </div>

        {sentReceipt && (
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Sent from <strong>{activeConnectedEmail}</strong> to{' '}
              <strong>{deliveredToEmail || contact.effectivePrimaryEmail}</strong> · Receipt:{' '}
              <span className="font-mono">{sentReceipt}</span>
            </span>
          </div>
        )}

        {sendError && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{sendError}</span>
            </div>
            <a
              href={broker.optOutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-emerald-300 font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <span>Use Portal</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {confirmStep && isDirectSendConnected && (
          <div className="p-4 glass-subtle border-emerald-500/35 rounded-2xl space-y-3 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-slate-200">
                Confirm sending this statutory demand from{' '}
                <strong className="text-emerald-400 font-mono">{activeConnectedEmail}</strong> to{' '}
                <strong className="font-mono">{contact.effectivePrimaryEmail}</strong>?
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmStep(false)}
                  disabled={isSending}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-slate-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmedSend}
                  disabled={isSending}
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {isSending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>{isSending ? 'Sending...' : 'Confirm & Send'}</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5 pt-2.5 border-t border-white/[0.08]">
              {contact.recommendedCcEmails.length > 0 && (
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ccBackupDpo}
                    onChange={(e) => setCcBackupDpo(e.target.checked)}
                    className="rounded border-white/20 bg-slate-950/60 text-emerald-500 focus:ring-0 cursor-pointer"
                  />
                  <span>
                    Also CC backup compliance desk (
                    <span className="font-mono text-emerald-300">
                      {contact.recommendedCcEmails[0]}
                    </span>
                    )
                  </span>
                </label>
              )}
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bccSelf}
                  onChange={(e) => setBccSelf(e.target.checked)}
                  className="rounded border-white/20 bg-slate-950/60 text-emerald-500 focus:ring-0 cursor-pointer"
                />
                <span>
                  Send a BCC copy to my own inbox (
                  <span className="font-mono">{activeConnectedEmail}</span>)
                </span>
              </label>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/[0.08]">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
            >
              Close
            </button>

            {webmailLinks && (
              <a
                href={webmailLinks.gmailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-xl glass-subtle hover:border-white/20 text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <span>Gmail Web Compose</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isDirectSendConnected ? (
              !confirmStep && !sentReceipt && contact.effectivePrimaryEmail && (
                <button
                  type="button"
                  onClick={() => setConfirmStep(true)}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Notice From {activeConnectedEmail}</span>
                </button>
              )
            ) : (
              onOpenConnectEmail && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenConnectEmail();
                  }}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Connect Email &amp; Send Notice</span>
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
