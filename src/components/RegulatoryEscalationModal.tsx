import React, { useState } from 'react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import {
  REGULATORY_AGENCIES,
  RegulatoryAgencyId,
  buildRegulatoryComplaintDossier,
  buildStatutoryEscalationNotice,
  computeBrokerSlaStatus,
} from '../utils/statutorySlaEngine';
import {
  useEmailConnection,
  sendEmailViaConnectedAccount,
} from '../services/emailConnectionStore';
import { downloadFile, copyTextToClipboard } from '../utils/exportEngines';
import {
  X,
  Scale,
  Send,
  Copy,
  Check,
  Download,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Mail,
  RefreshCw,
} from 'lucide-react';

interface RegulatoryEscalationModalProps {
  broker: DataBroker;
  result: ScanResult;
  profile: UserProfile;
  onClose: () => void;
  onRecordEscalationSent: (brokerId: string, receiptMessageId: string) => void;
  onOpenConnectEmail?: () => void;
}

export const RegulatoryEscalationModal: React.FC<RegulatoryEscalationModalProps> = ({
  broker,
  result,
  profile,
  onClose,
  onRecordEscalationSent,
  onOpenConnectEmail,
}) => {
  const { isDirectSendConnected, activeConnectedEmail } = useEmailConnection();
  const effectiveEmail = activeConnectedEmail || profile.emails[0] || 'consumer@example.com';
  const sla = computeBrokerSlaStatus(result);

  const [mode, setMode] = useState<'followup' | 'complaint'>('followup');
  const initialEscalation = buildStatutoryEscalationNotice(
    broker,
    result,
    profile,
    effectiveEmail
  );
  const [subjectLine, setSubjectLine] = useState(initialEscalation.subject);
  const [bodyText, setBodyText] = useState(initialEscalation.body);
  const [bccSelf, setBccSelf] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentReceipt, setSentReceipt] = useState<string | null>(null);

  const defaultAgency: RegulatoryAgencyId = profile.currentState === 'TX' ? 'TX_AG' : 'CPPA';
  const [agencyId, setAgencyId] = useState<RegulatoryAgencyId>(defaultAgency);
  const [copied, setCopied] = useState(false);

  const selectedAgency =
    REGULATORY_AGENCIES.find((a) => a.id === agencyId) || REGULATORY_AGENCIES[0];
  const complaintText = buildRegulatoryComplaintDossier(
    agencyId,
    broker,
    result,
    profile,
    effectiveEmail
  );

  const handleSendEscalation = async () => {
    if (!broker.privacyEmail) {
      setSendError('This broker does not disclose a direct privacy email; file a regulatory complaint packet instead.');
      return;
    }
    setIsSending(true);
    setSendError(null);
    try {
      const fullName = `${profile.firstName} ${profile.lastName}`.trim() || 'Authorized Consumer';
      const res = await sendEmailViaConnectedAccount({
        recipientEmail: broker.privacyEmail,
        subject: subjectLine,
        body: bodyText,
        senderName: fullName,
        brokerId: `escalation-${broker.id}`,
        brokerName: broker.name,
        brokerDomain: broker.domain,
        bccSelf,
      });
      setSentReceipt(res.messageId);
      onRecordEscalationSent(broker.id, res.messageId);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send escalation notice.');
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyCurrent = () => {
    const payload = mode === 'followup' ? `${subjectLine}\n\n${bodyText}` : complaintText;
    void copyTextToClipboard(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadComplaint = () => {
    const filename = `synOUT-${agencyId}-Complaint-${broker.id}-${profile.lastName.toLowerCase()}.txt`;
    downloadFile(complaintText, filename, 'text/plain');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="glass-popover rounded-2xl max-w-3xl w-full p-6 sm:p-8 space-y-5 my-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/[0.08]">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400 tabular-nums">
              <span className="text-amber-400 font-semibold flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5" />
                <span>Statutory SLA Escalation &amp; Enforcement</span>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {sla.state === 'overdue'
                  ? `Overdue (${sla.daysElapsed}d elapsed)`
                  : sla.state === 'unsubmitted'
                  ? 'Initial Demand Not Yet Sent'
                  : `${sla.daysElapsed}d elapsed / ${sla.daysRemaining}d left`}
              </span>
            </div>
            <h2 className="text-xl font-bold text-white">
              Escalation &amp; Regulatory Complaint: {broker.name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex p-1 glass-subtle rounded-xl">
            <button
              type="button"
              onClick={() => setMode('followup')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'followup'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              1. Second Statutory Cure Notice (Email)
            </button>
            <button
              type="button"
              onClick={() => setMode('complaint')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'complaint'
                  ? 'bg-amber-400 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              2. Regulatory Agency Complaint Packet
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopyCurrent}
            className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.09] text-xs font-semibold text-slate-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copied ? 'Copied' : 'Copy Text'}</span>
          </button>
        </div>

        {mode === 'followup' ? (
          <div className="space-y-4">
            <div className="p-3.5 glass-subtle rounded-xl text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2 font-mono">
              <span>Prior Receipt: {result.optOutConfirmationCode || 'None Recorded'}</span>
              <span>To: {broker.privacyEmail || 'Portal Only'}</span>
            </div>

            <div className="space-y-2.5">
              <input
                type="text"
                value={subjectLine}
                onChange={(e) => setSubjectLine(e.target.value)}
                className="w-full glass-input rounded-xl px-3.5 py-2 text-xs text-white font-mono"
              />
              <textarea
                rows={10}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                className="w-full p-4 glass-input rounded-xl font-mono text-xs text-slate-200 leading-relaxed resize-y"
              />
            </div>

            {isDirectSendConnected && (
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bccSelf}
                  onChange={(e) => setBccSelf(e.target.checked)}
                  className="rounded border-white/20 bg-slate-950 text-emerald-500"
                />
                <span>
                  BCC copy to <span className="font-mono">{activeConnectedEmail}</span> for regulatory evidence retention
                </span>
              </label>
            )}

            {sentReceipt && (
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Escalation notice dispatched from <strong>{activeConnectedEmail}</strong> · Receipt:{' '}
                  <span className="font-mono">{sentReceipt}</span>
                </span>
              </div>
            )}

            {sendError && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{sendError}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
              >
                Close
              </button>

              {isDirectSendConnected ? (
                <button
                  type="button"
                  onClick={handleSendEscalation}
                  disabled={isSending || Boolean(sentReceipt) || !broker.privacyEmail}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-xs inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  {isSending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>
                    {sentReceipt
                      ? 'Escalation Sent'
                      : `Send Follow-Up Demand via ${activeConnectedEmail}`}
                  </span>
                </button>
              ) : (
                onOpenConnectEmail && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenConnectEmail();
                    }}
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    <Mail className="w-4 h-4" />
                    <span>Connect Email to Send Escalation</span>
                  </button>
                )
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Agency Selector */}
            <div className="flex flex-wrap items-center gap-1.5">
              {REGULATORY_AGENCIES.map((ag) => (
                <button
                  key={ag.id}
                  type="button"
                  onClick={() => setAgencyId(ag.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    agencyId === ag.id
                      ? 'bg-amber-400 text-slate-950 font-bold'
                      : 'glass-subtle text-slate-300 hover:text-white'
                  }`}
                >
                  {ag.shortName}
                </button>
              ))}
            </div>

            <div className="p-3.5 glass-subtle rounded-xl text-xs space-y-1">
              <div className="font-bold text-white">{selectedAgency.name}</div>
              <div className="text-slate-400">
                Statute: <span className="text-slate-200">{selectedAgency.statute}</span> · Penalty:{' '}
                <span className="text-amber-300">{selectedAgency.penaltyCitation}</span>
              </div>
            </div>

            <pre className="p-4 glass-subtle rounded-xl font-mono text-xs text-slate-200 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
              {complaintText}
            </pre>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/[0.08]">
              <a
                href={selectedAgency.complaintPortalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.09] text-amber-300 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <span>Open {selectedAgency.shortName} Filing Portal</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleDownloadComplaint}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Complaint Packet (.txt)</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
