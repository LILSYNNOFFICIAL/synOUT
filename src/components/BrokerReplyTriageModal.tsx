import React, { useState, useMemo, useEffect } from 'react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import {
  analyzeBrokerReplyEmail,
  buildExemptionRebuttalNotice,
  buildIdMinimizationCounterNotice,
} from '../utils/replyTriageEngine';
import { buildWebmailComposeUrls } from '../utils/emailProviderConfig';
import {
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

  const availableBrokers = useMemo(() => {
    const list: DataBroker[] = [];
    const seen = new Set<string>();
    if (initialBroker) {
      list.push(initialBroker);
      seen.add(initialBroker.id);
    }
    for (const r of results) {
      if (r.status === 'exposed' || r.removalStatus === 'submitted' || r.removalStatus === 'removed') {
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

  const [rawReplyText, setRawReplyText] = useState<string>('');
  const [manualTicketOverride, setManualTicketOverride] = useState<string>('');
  const [counterMode, setCounterMode] = useState<'id_minimization' | 'exemption_rebuttal'>(
    'id_minimization'
  );
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
    if (analysis.category === 'EXEMPTION_CLAIM_OR_REFUSAL') {
      setCounterMode('exemption_rebuttal');
    } else if (analysis.category === 'EXCESSIVE_ID_DEMAND') {
      setCounterMode('id_minimization');
    }
  }, [analysis]);

  useEffect(() => {
    if (!activeBroker) return;
    const sender = activeConnectedEmail || profile.emails[0] || '';
    const built =
      counterMode === 'exemption_rebuttal'
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
  }, [activeBroker, profile, activeConnectedEmail, counterMode, activeTicketId]);

  const handleCopy = async (key: string, text: string) => {
    await copyTextToClipboard(text);
    setCopiedItem(key);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  const handleSendCounterNotice = async () => {
    if (!activeBroker) return;
    const recipient = activeBroker.privacyEmail || `privacy@${activeBroker.domain}`;
    setIsSending(true);
    setSendError(null);
    setSendSuccess(null);
    try {
      const res = await sendEmailViaConnectedAccount({
        recipientEmail: recipient,
        subject,
        body,
        senderName: `${profile.firstName} ${profile.lastName}`,
        brokerId: activeBroker.id,
        brokerName: activeBroker.name,
        brokerDomain: activeBroker.domain,
        bccSelf: true,
      });
      onRecordCounterNoticeSent(activeBroker.id, res.messageId);
      setSendSuccess(`Counter-notice transmitted from ${res.sentFrom} · Receipt: ${res.messageId}`);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send counter-notice.');
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

  const recipientEmail = activeBroker?.privacyEmail || `privacy@${activeBroker?.domain || 'broker.com'}`;
  const webmailUrls = buildWebmailComposeUrls(recipientEmail, subject, body);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-6 sm:p-8 space-y-6 shadow-2xl my-8 text-xs">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-mono text-emerald-400">
              <Inbox className="w-4 h-4" />
              <span>Inbound Broker Reply Triage · 11 CCR § 7060 Verification Shield</span>
            </div>
            <h2 className="text-xl font-bold text-white">
              Broker Response Parser, Link Sanitizer &amp; Statutory Rebuttal
            </h2>
            <p className="text-slate-400">
              Paste any email reply from a data broker to strip tracking links, extract case tickets, and counter unlawful government-ID or exemption claims.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Broker Selector + Quick Test Samples */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block font-semibold text-slate-300">
              Target Data Broker
            </label>
            <select
              value={selectedBrokerId}
              onChange={(e) => {
                setSelectedBrokerId(e.target.value);
                setTicketSavedBanner(null);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-emerald-500"
            >
              {availableBrokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.domain})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block font-semibold text-slate-300">
              Load Representative Broker Reply Pattern
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
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
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
            Paste Inbound Broker Email (Headers + Message Body)
          </label>
          <textarea
            rows={5}
            value={rawReplyText}
            onChange={(e) => setRawReplyText(e.target.value)}
            placeholder="Paste the email text received from the data broker's privacy office or automated opt-out system..."
            className="w-full p-3.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-y"
          />
        </div>

        {/* Analysis Output */}
        {analysis && (
          <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                {analysis.category === 'DELETION_CONFIRMED' ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : analysis.category === 'EXCESSIVE_ID_DEMAND' ||
                  analysis.category === 'EXEMPTION_CLAIM_OR_REFUSAL' ? (
                  <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                )}
                <span className="text-sm font-bold text-white">{analysis.categoryLabel}</span>
              </div>
              <span
                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold shrink-0 whitespace-nowrap ${
                  analysis.category === 'DELETION_CONFIRMED'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : analysis.category === 'EXCESSIVE_ID_DEMAND' ||
                      analysis.category === 'EXEMPTION_CLAIM_OR_REFUSAL'
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                    : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                }`}
              >
                {analysis.category}
              </span>
            </div>

            <p className="text-slate-300 leading-relaxed">{analysis.summary}</p>

            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-300">
              <strong className="text-emerald-400">Recommended Next Step: </strong>
              {analysis.recommendedAction}
            </div>

            {/* Extracted Sanitized Confirmation Links */}
            {analysis.extractedLinks.length > 0 && (
              <div className="space-y-2">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-sky-400" />
                  <span>Sanitized Verification Links ({analysis.extractedLinks.length})</span>
                </div>

                {analysis.hasDomainMismatchWarning && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 flex items-center gap-2">
                    <FileWarning className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>
                      Domain Mismatch Warning: At least one link points outside{' '}
                      <code className="font-mono">{activeBroker?.domain}</code>. Inspect carefully before opening.
                    </span>
                  </div>
                )}

                {analysis.extractedLinks.map((lnk, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="font-mono text-sky-300 break-all text-[11px]">
                        {lnk.sanitizedUrl}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-slate-400">
                        <span>Host: {lnk.host || 'unknown'}</span>
                        {lnk.matchesBrokerDomain === true && (
                          <span className="text-emerald-400">Matches {activeBroker?.domain}</span>
                        )}
                        {lnk.matchesBrokerDomain === false && (
                          <span className="text-rose-400">External Host Mismatch</span>
                        )}
                        {lnk.strippedParams.length > 0 && (
                          <span className="text-amber-300">
                            Stripped {lnk.strippedParams.length} tracker(s): {lnk.strippedParams.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopy(`link-${idx}`, lnk.sanitizedUrl)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
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
            )}

            {/* Ticket Recording & Verified Scrubbed Action */}
            <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div className="space-y-1 flex-1">
                <label className="block font-semibold text-slate-300">
                  Broker Confirmation / Case Ticket ID
                </label>
                <input
                  type="text"
                  value={activeTicketId}
                  onChange={(e) => setManualTicketOverride(e.target.value)}
                  placeholder="e.g. REQ-884920 or DEL-774102"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
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
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Open Redacted ID &amp; EXIF Lab</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleRecordTriageOutcome(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold cursor-pointer whitespace-nowrap"
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

        {/* Statutory Counter-Notice & Exemption Rebuttal Composer */}
        <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white">
                Statutory Counter-Notice &amp; Legal Rebuttal Generator
              </h3>
              <p className="text-[11px] text-slate-400">
                Push back against unlawful unredacted-ID demands or false public-record exemption claims.
              </p>
            </div>

            <div className="inline-flex p-1 bg-slate-900 border border-slate-800 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setCounterMode('id_minimization')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
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
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
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
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
            />
            <textarea
              rows={7}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full p-3.5 bg-slate-900 border border-slate-800 rounded-xl font-mono text-[11px] text-slate-200 focus:outline-none focus:border-emerald-500 resize-y"
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

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopy('counter-body', `${subject}\n\n${body}`)}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
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
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Download .txt</span>
              </button>

              <a
                href={webmailUrls.gmailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white font-semibold inline-flex items-center gap-1 whitespace-nowrap"
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
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                {isSending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>
                  {isSending
                    ? 'Sending Counter-Notice...'
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
                className="px-4 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold cursor-pointer whitespace-nowrap"
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
