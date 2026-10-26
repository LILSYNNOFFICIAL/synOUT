import React, { useState, useMemo, useEffect } from 'react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import {
  analyzeBrokerReplyEmail,
  buildExemptionRebuttalNotice,
  buildIdMinimizationCounterNotice,
} from '../utils/replyTriageEngine';
import {
  isValidEmailSyntax,
  markBrokerEmailBounced,
  resolveBrokerContactProfile,
  setBrokerCustomEmail,
  useBrokerContactOverrides,
} from '../utils/brokerContactResolver';
import { buildWebmailComposeUrls } from '../utils/emailProviderConfig';
import {
  buildStatutoryNoticeForBroker,
  findBrokerById,
  sendEmailViaConnectedAccount,
  useEmailConnection,
} from '../services/emailConnectionStore';
import { copyTextToClipboard, downloadFile } from '../utils/exportEngines';
import {
  X,
  Inbox,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Link2,
  ExternalLink,
  Copy,
  Check,
  Send,
  Download,
  RefreshCw,
  FileWarning,
  Lock,
} from 'lucide-react';

interface BrokerReplyTriageModalProps {
  initialBroker?: DataBroker;
  initialResult?: ScanResult;
  results: ScanResult[];
  profile: UserProfile;
  onSaveTicketAndNotes: (
    brokerId: string,
    ticketId: string | undefined,
    summaryNote: string,
    markVerifiedRemoved: boolean
  ) => void;
  onRecordCounterNoticeSent: (brokerId: string, receiptMessageId: string) => void;
  onOpenConnectEmail: () => void;
  onOpenIdRedactor?: () => void;
  onClose: () => void;
}

const SAMPLE_BROKER_REPLIES: {
  id: string;
  label: string;
  sampleText: (brokerDomain: string, brokerName: string) => string;
}[] = [
  {
    id: 'bounce_ndr',
    label: 'Sample: 550 Mailer-Daemon Bounce',
    sampleText: (domain) =>
      `From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>\nSubject: Delivery Status Notification (Failure)\n\nAddress not found\nYour message wasn't delivered to support@${domain} because the address couldn't be found, or is unable to receive mail.\n\nFinal-Recipient: rfc822; support@${domain}\nStatus: 5.1.1\nDiagnostic-Code: smtp; 550 5.1.1 The email account that you tried to reach does not exist.`,
  },
  {
    id: 'excessive_id',
    label: 'Sample: Unlawful Gov ID Demand',
    sampleText: (domain, name) =>
      `From: privacy@${domain}\nSubject: Action Required - Privacy Request #REQ-884920 (${name})\n\nHello,\nBefore we can process your CCPA opt-out and deletion request (Case #REQ-884920), please reply with a clear color copy of your unredacted Government-Issued Photo ID (Driver's License or Passport) and a recent utility bill showing your Social Security Number last 4 digits.`,
  },
  {
    id: 'confirm_link',
    label: 'Sample: One-Time Confirm Link + Trackers',
    sampleText: (domain, name) =>
      `From: noreply@${domain}\nSubject: Confirm your opt-out request with ${name} [Ticket: OPT-551904]\n\nPlease click the link below within 24 hours to verify your email and complete your opt-out request:\nhttps://${domain}/optout/verify?token=9f8a7b6c5d4e&ticket=OPT-551904&utm_source=transactional&utm_campaign=ccpa_verify&fbclid=IwAR992817263&mc_eid=a8812b`,
  },
  {
    id: 'exemption_refusal',
    label: 'Sample: Public Records Exemption Refusal',
    sampleText: (domain, name) =>
      `From: legal@${domain}\nSubject: Response to Privacy Inquiry Reference ID: LGL-309411\n\nWe are unable to fulfill your deletion request because ${name} only publishes publicly available government records and directory assistance information exempt under the First Amendment.`,
  },
  {
    id: 'deletion_confirmed',
    label: 'Sample: Deletion Confirmed',
    sampleText: (domain, name) =>
      `From: compliance@${domain}\nSubject: Confirmation ID: DEL-774102 - Record Suppressed\n\nYour personal information has been removed from ${name} public search results and added to our permanent suppression list under Confirmation #DEL-774102.`,
  },
];

function formatTriageStatusProse(category: string): string {
  switch (category) {
    case 'DELETION_CONFIRMED':
      return 'Deletion Confirmed';
    case 'DELIVERY_BOUNCE_NDR':
      return 'Undeliverable Bounce';
    case 'EXCESSIVE_ID_DEMAND':
      return 'Unlawful ID Demand';
    case 'EXEMPTION_CLAIM_OR_REFUSAL':
      return 'Exemption Claim';
    case 'CONFIRMATION_LINK_REQUIRED':
      return 'Confirmation Link Required';
    default:
      return 'Review Required';
  }
}

export const BrokerReplyTriageModal: React.FC<BrokerReplyTriageModalProps> = ({
  initialBroker,
  results,
  profile,
  onSaveTicketAndNotes,
  onRecordCounterNoticeSent,
  onOpenConnectEmail,
  onOpenIdRedactor,
  onClose,
}) => {
  const { isDirectSendConnected, activeConnectedEmail } = useEmailConnection();
  const overrides = useBrokerContactOverrides();

  const availableBrokers = useMemo(() => {
    const list: DataBroker[] = [];
    const seen = new Set<string>();
    if (initialBroker) {
      list.push(initialBroker);
      seen.add(initialBroker.id);
    }
    for (const r of results) {
      if (
        r.status === 'exposed' ||
        r.removalStatus === 'submitted' ||
        r.removalStatus === 'removed'
      ) {
        const b = findBrokerById(r.brokerId);
        if (b && !seen.has(b.id)) {
          list.push(b);
          seen.add(b.id);
        }
      }
    }
    if (list.length === 0) {
      const fallback = findBrokerById('whitepages');
      if (fallback) list.push(fallback);
    }
    return list;
  }, [initialBroker, results]);

  const [selectedBrokerId, setSelectedBrokerId] = useState<string>(
    initialBroker?.id || availableBrokers[0]?.id || 'whitepages'
  );
  const activeBroker = useMemo(
    () =>
      availableBrokers.find((b) => b.id === selectedBrokerId) ||
      findBrokerById(selectedBrokerId),
    [availableBrokers, selectedBrokerId]
  );

  const contact = useMemo(
    () => (activeBroker ? resolveBrokerContactProfile(activeBroker, overrides) : null),
    [activeBroker, overrides]
  );

  const [rawReplyText, setRawReplyText] = useState<string>('');
  const [manualTicketOverride, setManualTicketOverride] = useState<string>('');
  const [counterMode, setCounterMode] = useState<
    'id_minimization' | 'exemption_rebuttal' | 'resend_initial_demand'
  >('id_minimization');
  const [customRecipientInput, setCustomRecipientInput] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [ticketSavedBanner, setTicketSavedBanner] = useState<string | null>(null);

  const analysis = useMemo(() => {
    if (!rawReplyText.trim()) return null;
    return analyzeBrokerReplyEmail(rawReplyText, activeBroker);
  }, [rawReplyText, activeBroker]);

  const activeTicketId =
    manualTicketOverride.trim() || analysis?.extractedTicketIds[0] || '';

  useEffect(() => {
    if (!analysis) return;
    if (analysis.category === 'DELIVERY_BOUNCE_NDR') {
      setCounterMode('resend_initial_demand');
    } else if (analysis.category === 'EXEMPTION_CLAIM_OR_REFUSAL') {
      setCounterMode('exemption_rebuttal');
    } else if (analysis.category === 'EXCESSIVE_ID_DEMAND') {
      setCounterMode('id_minimization');
    }
  }, [analysis]);

  useEffect(() => {
    if (!activeBroker) return;
    const sender = activeConnectedEmail || profile.emails[0] || '';
    const built =
      counterMode === 'resend_initial_demand'
        ? buildStatutoryNoticeForBroker(activeBroker, profile, sender || undefined)
        : counterMode === 'exemption_rebuttal'
        ? buildExemptionRebuttalNotice(activeBroker, profile, sender, activeTicketId || undefined)
        : buildIdMinimizationCounterNotice(
            activeBroker,
            profile,
            sender,
            activeTicketId || undefined
          );
    setSubject(built.subject);
    setBody(built.body);
    setSendError(null);
    setSendSuccess(null);
  }, [
    activeBroker,
    profile,
    activeConnectedEmail,
    counterMode,
    activeTicketId,
    contact?.effectivePrimaryEmail,
  ]);

  const handleCopy = async (key: string, text: string) => {
    await copyTextToClipboard(text);
    setCopiedItem(key);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  const handleBlacklistBouncedAndSwitch = (nextEmail?: string) => {
    if (!activeBroker || !analysis) return;
    for (const bounced of analysis.bouncedAddresses) {
      markBrokerEmailBounced(activeBroker.id, bounced);
    }
    const target = (nextEmail || customRecipientInput || analysis.recommendedFallbackEmail || '')
      .trim()
      .toLowerCase();
    if (target && isValidEmailSyntax(target)) {
      setBrokerCustomEmail(activeBroker.id, target, undefined, 'Remediated after NDR bounce');
      setCustomRecipientInput('');
      setTicketSavedBanner(
        `Blacklisted bounced address and routed ${activeBroker.name} to ${target}.`
      );
    } else {
      setTicketSavedBanner(`Blacklisted bounced address for ${activeBroker.name}.`);
    }
  };

  const handleSendCounterNotice = async () => {
    if (!activeBroker) return;
    const recipient =
      contact?.effectivePrimaryEmail ||
      activeBroker.privacyEmail ||
      `privacy@${activeBroker.domain}`;
    setIsSending(true);
    setSendError(null);
    setSendSuccess(null);
    try {
      const res = await sendEmailViaConnectedAccount({
        recipientEmail: recipient,
        fallbackRecipientEmails: contact?.fallbackEmails || [],
        ccEmails: contact?.recommendedCcEmails || [],
        subject,
        body,
        senderName: `${profile.firstName} ${profile.lastName}`,
        brokerId: activeBroker.id,
        brokerName: activeBroker.name,
        brokerDomain: activeBroker.domain,
        bccSelf: true,
      });
      onRecordCounterNoticeSent(activeBroker.id, res.messageId);
      setSendSuccess(
        `Transmitted from ${res.sentFrom} to ${res.deliveredTo || recipient} · Receipt: ${res.messageId}`
      );
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send notice.');
    } finally {
      setIsSending(false);
    }
  };

  const handleRecordTriageOutcome = (markVerifiedRemoved: boolean) => {
    if (!activeBroker) return;
    const summaryLabel = analysis
      ? `${analysis.categoryLabel}${activeTicketId ? ` (Ref: ${activeTicketId})` : ''}`
      : `Manual Ticket Logged${activeTicketId ? ` (${activeTicketId})` : ''}`;
    onSaveTicketAndNotes(
      activeBroker.id,
      activeTicketId || undefined,
      summaryLabel,
      markVerifiedRemoved
    );
    setTicketSavedBanner(
      markVerifiedRemoved
        ? `Marked ${activeBroker.name} as Verified Scrubbed with confirmation ${activeTicketId || 'recorded'}.`
        : `Saved broker ticket ${activeTicketId || 'notes'} to ${activeBroker.name} SLA record.`
    );
  };

  const recipientEmail =
    contact?.effectivePrimaryEmail ||
    activeBroker?.privacyEmail ||
    `privacy@${activeBroker?.domain || 'broker.com'}`;
  const webmailUrls = buildWebmailComposeUrls(recipientEmail, subject, body);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="glass-popover rounded-3xl max-w-4xl w-full p-6 sm:p-8 space-y-6 my-8 text-xs">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/[0.08]">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-slate-400">
              <Inbox className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Inbound Broker Reply &amp; Bounce Triage</span>
              <span aria-hidden="true">·</span>
              <span>11 CCR § 7060 Verification Shield</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Broker Response Parser, Bounce Remediator &amp; Statutory Rebuttal
            </h2>
            <p className="text-slate-400 leading-relaxed">
              Paste any broker email reply or Mailer-Daemon bounce message to blacklist dead
              addresses, switch to verified backup DPO contacts, sanitize links, or counter
              unlawful ID demands.
            </p>
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

        {/* Broker Selector + Quick Test Samples */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block font-semibold text-slate-300">Target Data Broker</label>
            <select
              value={selectedBrokerId}
              onChange={(e) => {
                setSelectedBrokerId(e.target.value);
                setTicketSavedBanner(null);
              }}
              className="w-full glass-input rounded-xl px-3.5 py-2.5 text-white"
            >
              {availableBrokers.map((b) => (
                <option key={b.id} value={b.id} className="bg-slate-900">
                  {b.name} ({b.domain})
                </option>
              ))}
            </select>
            {contact && (
              <div className="text-[11px] font-mono text-slate-400 flex flex-wrap items-center gap-1.5 pt-0.5">
                <span>Active DPO:</span>
                <span className="text-emerald-400">{contact.effectivePrimaryEmail}</span>
                <span aria-hidden="true">·</span>
                <span>{contact.deliverabilityLabel}</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block font-semibold text-slate-300">
              Load Representative Broker Reply or Bounce Pattern
            </label>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_BROKER_REPLIES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (!activeBroker) return;
                    setRawReplyText(s.sampleText(activeBroker.domain, activeBroker.name));
                    setManualTicketOverride('');
                    setTicketSavedBanner(null);
                  }}
                  className="px-2.5 py-1.5 rounded-lg glass-subtle hover:border-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Raw Email Input */}
        <div className="space-y-1.5">
          <label className="block font-semibold text-slate-300">
            Paste Inbound Broker Email or Mailer-Daemon Bounce Notice (Headers + Body)
          </label>
          <textarea
            rows={5}
            value={rawReplyText}
            onChange={(e) => setRawReplyText(e.target.value)}
            placeholder="Paste the email text or 550 bounce notification received from your mail server or the data broker..."
            className="w-full p-3.5 glass-input rounded-xl font-mono text-xs text-slate-200 placeholder-slate-500 resize-y"
          />
        </div>

        {/* Analysis Output */}
        {analysis && (
          <div className="p-5 glass-subtle rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                {analysis.category === 'DELETION_CONFIRMED' ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : analysis.category === 'DELIVERY_BOUNCE_NDR' ||
                  analysis.category === 'EXCESSIVE_ID_DEMAND' ||
                  analysis.category === 'EXEMPTION_CLAIM_OR_REFUSAL' ? (
                  <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                )}
                <span className="text-sm font-bold text-white">{analysis.categoryLabel}</span>
              </div>
              <span
                className={`text-[11px] font-medium shrink-0 whitespace-nowrap ${
                  analysis.category === 'DELETION_CONFIRMED'
                    ? 'text-emerald-400'
                    : analysis.category === 'DELIVERY_BOUNCE_NDR' ||
                      analysis.category === 'EXCESSIVE_ID_DEMAND' ||
                      analysis.category === 'EXEMPTION_CLAIM_OR_REFUSAL'
                    ? 'text-rose-400'
                    : 'text-amber-300'
                }`}
              >
                {formatTriageStatusProse(analysis.category)}
              </span>
            </div>

            <p className="text-slate-300 leading-relaxed">{analysis.summary}</p>

            <div className="pt-3 border-t border-white/[0.07] text-slate-300 leading-relaxed">
              <strong className="text-emerald-400">Recommended Next Step: </strong>
              {analysis.recommendedAction}
            </div>

            {/* Dedicated Bounce / NDR Remediation Workflow */}
            {analysis.category === 'DELIVERY_BOUNCE_NDR' && activeBroker && (
              <div className="pt-4 border-t border-white/[0.08] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-amber-300">
                    Undeliverable Address Mitigation ({activeBroker.name})
                  </div>
                  <a
                    href={activeBroker.optOutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <span>Open Official Opt-Out Portal</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                {analysis.bouncedAddresses.length > 0 && (
                  <div className="text-[11px] font-mono text-rose-300">
                    Detected bounced mailbox: {analysis.bouncedAddresses.join(', ')}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {analysis.recommendedFallbackEmail && (
                    <button
                      type="button"
                      onClick={() =>
                        handleBlacklistBouncedAndSwitch(analysis.recommendedFallbackEmail)
                      }
                      className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold cursor-pointer whitespace-nowrap"
                    >
                      Blacklist Bounced &amp; Switch to {analysis.recommendedFallbackEmail}
                    </button>
                  )}

                  <div className="flex items-center gap-1.5 flex-1 min-w-[230px]">
                    <input
                      type="email"
                      value={customRecipientInput}
                      onChange={(e) => setCustomRecipientInput(e.target.value)}
                      placeholder="Or enter custom verified DPO email..."
                      className="flex-1 glass-input rounded-lg px-3 py-1.5 text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleBlacklistBouncedAndSwitch(customRecipientInput)}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.1] text-white font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Apply DPO
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Extracted Sanitized Confirmation Links */}
            {analysis.extractedLinks.length > 0 && (
              <div className="pt-4 border-t border-white/[0.08] space-y-2.5">
                <div className="font-bold text-white flex items-center gap-1.5 tabular-nums">
                  <Link2 className="w-3.5 h-3.5 text-sky-400" />
                  <span>Sanitized Verification Links ({analysis.extractedLinks.length})</span>
                </div>

                {analysis.hasDomainMismatchWarning && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 flex items-center gap-2">
                    <FileWarning className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>
                      Domain Mismatch Warning: At least one link points outside{' '}
                      <code className="font-mono">{activeBroker?.domain}</code>. Inspect carefully
                      before opening.
                    </span>
                  </div>
                )}

                <div className="divide-y divide-white/[0.07] rounded-xl border border-white/[0.08] bg-slate-950/40 overflow-hidden">
                  {analysis.extractedLinks.map((lnk, idx) => (
                    <div
                      key={idx}
                      className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="font-mono text-sky-300 break-all text-[11px]">
                          {lnk.sanitizedUrl}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-slate-400">
                          <span>Host: {lnk.host || 'unknown'}</span>
                          {lnk.matchesBrokerDomain === true && (
                            <span className="text-emerald-400">
                              · Matches {activeBroker?.domain}
                            </span>
                          )}
                          {lnk.matchesBrokerDomain === false && (
                            <span className="text-rose-400">· External Host Mismatch</span>
                          )}
                          {lnk.strippedParams.length > 0 && (
                            <span className="text-amber-300">
                              · Stripped {lnk.strippedParams.length} tracker(s):{' '}
                              {lnk.strippedParams.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopy(`link-${idx}`, lnk.sanitizedUrl)}
                          className="px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-300 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          {copiedItem === `link-${idx}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>Copy Clean URL</span>
                        </button>
                        <a
                          href={lnk.sanitizedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                        >
                          <span>Open Link</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ticket Recording & Verified Scrubbed Action */}
            <div className="pt-3 border-t border-white/[0.08] flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div className="space-y-1 flex-1">
                <label className="block font-semibold text-slate-300">
                  Broker Confirmation / Case Ticket ID
                </label>
                <input
                  type="text"
                  value={activeTicketId}
                  onChange={(e) => setManualTicketOverride(e.target.value)}
                  placeholder="e.g. REQ-884920 or DEL-774102"
                  className="w-full glass-input rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {analysis.category === 'EXCESSIVE_ID_DEMAND' && onOpenIdRedactor && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenIdRedactor();
                    }}
                    className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-amber-300 font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Open Redacted ID &amp; EXIF Lab</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleRecordTriageOutcome(false)}
                  className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white font-semibold cursor-pointer whitespace-nowrap"
                >
                  Save Ticket to SLA Tracker
                </button>

                <button
                  type="button"
                  onClick={() => handleRecordTriageOutcome(true)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirm Broker Scrubbed</span>
                </button>
              </div>
            </div>

            {ticketSavedBanner && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{ticketSavedBanner}</span>
              </div>
            )}
          </div>
        )}

        {/* Statutory Counter-Notice, Bounce Re-Dispatch & Exemption Rebuttal Composer */}
        <div className="p-5 glass-subtle rounded-2xl space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white">
                Statutory Counter-Notice &amp; Verified Backup DPO Re-Dispatch
              </h3>
              <p className="text-[11px] text-slate-400">
                Re-send bounced deletion notices to a verified backup DPO, or counter unlawful ID
                and exemption claims.
              </p>
            </div>

            <div className="inline-flex flex-wrap p-1 bg-slate-950/60 border border-white/[0.08] rounded-xl shrink-0 gap-1">
              <button
                type="button"
                onClick={() => setCounterMode('resend_initial_demand')}
                className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  counterMode === 'resend_initial_demand'
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Re-Send Deletion Demand
              </button>
              <button
                type="button"
                onClick={() => setCounterMode('id_minimization')}
                className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  counterMode === 'id_minimization'
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                11 CCR § 7060 ID Objection
              </button>
              <button
                type="button"
                onClick={() => setCounterMode('exemption_rebuttal')}
                className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  counterMode === 'exemption_rebuttal'
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Omnibus Exemption Rebuttal
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full glass-input rounded-xl px-3.5 py-2 text-white font-mono text-xs"
            />
            <textarea
              rows={7}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full p-3.5 glass-input rounded-xl font-mono text-[11px] text-slate-200 resize-y"
            />
          </div>

          {sendSuccess && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{sendSuccess}</span>
            </div>
          )}

          {sendError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{sendError}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/[0.08]">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopy('counter-body', `${subject}\n\n${body}`)}
                className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-200 font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                {copiedItem === 'counter-body' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedItem === 'counter-body' ? 'Copied' : 'Copy Notice'}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  downloadFile(
                    `${subject}\n\n${body}`,
                    `synout-rebuttal-${activeBroker?.id || 'broker'}.txt`,
                    'text/plain;charset=utf-8'
                  )
                }
                className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-200 font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Download .txt</span>
              </button>

              <a
                href={webmailUrls.gmailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-300 hover:text-white font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                <span>Gmail Web</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {isDirectSendConnected ? (
              <button
                type="button"
                disabled={isSending}
                onClick={handleSendCounterNotice}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                {isSending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>
                  {isSending
                    ? 'Sending Notice...'
                    : `Send to ${recipientEmail} (${activeConnectedEmail})`}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenConnectEmail();
                }}
                className="px-4 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold transition-colors cursor-pointer whitespace-nowrap"
              >
                Connect Email for Direct Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
