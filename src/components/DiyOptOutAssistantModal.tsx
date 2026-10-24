import React, { useState } from 'react';
import { DataBroker, ScanResult, UserProfile } from '../types';
import {
  useEmailConnection,
  sendEmailViaConnectedAccount,
  buildStatutoryNoticeForBroker,
} from '../services/emailConnectionStore';
import { copyTextToClipboard } from '../utils/exportEngines';
import {
  X,
  Copy,
  Check,
  ExternalLink,
  CheckCircle,
  Shield,
  Mail,
  FileText,
  Send,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface DiyOptOutAssistantModalProps {
  broker: DataBroker;
  result: ScanResult;
  profile: UserProfile;
  onClose: () => void;
  onMarkWebFormSubmitted: (brokerId: string) => void;
  onMarkEmailDispatched: (brokerId: string, messageId: string) => void;
  onOpenConnectEmail?: () => void;
}

export const DiyOptOutAssistantModal: React.FC<DiyOptOutAssistantModalProps> = ({
  broker,
  profile,
  onClose,
  onMarkWebFormSubmitted,
  onMarkEmailDispatched,
  onOpenConnectEmail,
}) => {
  const { isDirectSendConnected, activeConnectedEmail } = useEmailConnection();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [confirmEmailSend, setConfirmEmailSend] = useState(false);
  const [bccSelf, setBccSelf] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentReceipt, setSentReceipt] = useState<string | null>(null);

  const copyToClipboard = (text: string, fieldName: string) => {
    void copyTextToClipboard(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const primaryEmail = activeConnectedEmail || profile.emails[0] || '';
  const primaryPhone = profile.phoneNumbers[0] || '';
  const location = `${profile.currentCity}, ${profile.currentState} ${profile.currentZip || ''}`.trim();

  const statutoryDraft = buildStatutoryNoticeForBroker(broker, profile, primaryEmail || undefined);
  const mailtoUrl = broker.privacyEmail
    ? `mailto:${broker.privacyEmail}?subject=${encodeURIComponent(
        statutoryDraft.subject
      )}&body=${encodeURIComponent(statutoryDraft.body)}`
    : '';

  const writtenDeclaration = `FORMAL WRITTEN CONSUMER DEMAND FOR DATA EXPUNGEMENT & SUPPRESSION

DATE: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
TO: Privacy & Compliance Division, ${broker.name} (${broker.domain})

Pursuant to consumer protection and privacy statutes, I hereby demand permanent suppression and expungement of my consumer file from your repositories.

CONSUMER IDENTIFICATION:
- Full Legal Name: ${fullName}
- Primary Address: ${location}
- Contact Phone: ${primaryPhone || 'Unlisted'}
- Contact Email: ${primaryEmail || 'N/A'}

I declare under penalty of perjury that I am the individual identified above and demand compliance within 30-45 calendar days.

Signature: ___________________________
Printed Name: ${fullName}`;

  const handleDirectSend = async () => {
    if (!broker.privacyEmail) return;
    setIsSending(true);
    setSendError(null);
    try {
      const res = await sendEmailViaConnectedAccount({
        recipientEmail: broker.privacyEmail,
        subject: statutoryDraft.subject,
        body: statutoryDraft.body,
        senderName: fullName || 'Authorized Consumer',
        brokerId: broker.id,
        brokerName: broker.name,
        brokerDomain: broker.domain,
        bccSelf,
      });
      setSentReceipt(res.messageId);
      setConfirmEmailSend(false);
      onMarkEmailDispatched(broker.id, res.messageId);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed sending opt-out email.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative my-8">
        {/* Header */}
        <div className="p-6 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400">
                <span className="text-emerald-400 font-semibold">{broker.removalMethod}</span>
                <span aria-hidden="true">·</span>
                <span>{broker.domain}</span>
              </div>
              <h3 className="text-lg font-bold text-white">Opt-Out Assistant: {broker.name}</h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Methodology Banner */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Methodology:</span>
              <span className="font-semibold text-white">{broker.removalMethod}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Est. Time:</span>
              <span className="font-mono text-emerald-400 font-medium">{broker.removalTime}</span>
            </div>
          </div>

          {/* Direct Connected Email Dispatch for Any Broker With a Privacy Email */}
          {broker.privacyEmail && (
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 font-semibold text-emerald-400">
                  <Mail className="w-4 h-4" />
                  <span>Direct Compliance Email ({broker.privacyEmail})</span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(broker.privacyEmail, 'pEmail')}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-lg text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                >
                  {copiedField === 'pEmail' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>Copy DPO Email</span>
                </button>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Send a formal statutory CCPA/CPRA deletion demand directly from your connected email address, or open your default mail client.
              </p>

              {sentReceipt && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Sent from <strong>{activeConnectedEmail}</strong> · Receipt:{' '}
                    <span className="font-mono">{sentReceipt}</span>
                  </span>
                </div>
              )}

              {sendError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{sendError}</span>
                </div>
              )}

              {confirmEmailSend && isDirectSendConnected ? (
                <div className="p-3.5 bg-slate-900 border border-emerald-500/40 rounded-xl space-y-2.5 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-slate-200">
                      Confirm sending statutory demand from{' '}
                      <strong className="text-emerald-400 font-mono">{activeConnectedEmail}</strong> to{' '}
                      <strong className="font-mono">{broker.privacyEmail}</strong>?
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setConfirmEmailSend(false)}
                        disabled={isSending}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDirectSend}
                        disabled={isSending}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer pt-2 border-t border-slate-800">
                    <input
                      type="checkbox"
                      checked={bccSelf}
                      onChange={(e) => setBccSelf(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0 cursor-pointer"
                    />
                    <span>Send a BCC copy to {activeConnectedEmail}</span>
                  </label>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {isDirectSendConnected ? (
                    <button
                      type="button"
                      onClick={() => setConfirmEmailSend(true)}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send From {activeConnectedEmail}</span>
                    </button>
                  ) : (
                    onOpenConnectEmail && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenConnectEmail();
                        }}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Connect Email &amp; Send</span>
                      </button>
                    )
                  )}

                  <a
                    href={mailtoUrl}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Open Default Mail Client</span>
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Special Action for Mail-In Demand */}
          {broker.removalMethod === 'Mail-In' && (
            <div className="p-4 bg-amber-950/30 border border-amber-800/40 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                <FileText className="w-4 h-4 text-amber-400" />
                <span>Written / Notarized Postal Demand</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                This institution requires a written declaration to freeze consumer payroll and employment archives:
              </p>
              <button
                type="button"
                onClick={() => copyToClipboard(writtenDeclaration, 'decl')}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedField === 'decl' ? (
                  <Check className="w-3.5 h-3.5 text-slate-950" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Copy Ready-to-Print Postal Declaration</span>
              </button>
            </div>
          )}

          {/* Quick-Copy Pre-fill Fields */}
          <div>
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
              1-Click Copy Fields (Paste into {broker.name} Web Form):
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 block">Full Name</span>
                  <span className="font-mono text-white font-medium">{fullName}</span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(fullName, 'name')}
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
                  title="Copy Full Name"
                >
                  {copiedField === 'name' ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 block">Email Address</span>
                  <span className="font-mono text-white font-medium truncate max-w-[170px] block">
                    {primaryEmail || 'No email entered'}
                  </span>
                </div>
                {primaryEmail && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(primaryEmail, 'email')}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
                    title="Copy Email"
                  >
                    {copiedField === 'email' ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 block">Phone Number</span>
                  <span className="font-mono text-white font-medium">
                    {primaryPhone || 'No phone entered'}
                  </span>
                </div>
                {primaryPhone && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(primaryPhone, 'phone')}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
                    title="Copy Phone"
                  >
                    {copiedField === 'phone' ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 block">Location</span>
                  <span className="font-mono text-white font-medium">{location}</span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(location, 'location')}
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
                  title="Copy Location"
                >
                  {copiedField === 'location' ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Broker Instructions */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Official Web-Form Steps for {broker.domain}:
            </div>
            <ol className="list-decimal list-inside space-y-2 text-xs text-slate-300 bg-slate-950 p-4 rounded-xl border border-slate-800">
              {broker.instructions.map((step, idx) => (
                <li key={idx} className="leading-relaxed">
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-800/80 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              onMarkWebFormSubmitted(broker.id);
              onClose();
            }}
            className="px-4 py-2.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Log Manual Web-Form Submission</span>
          </button>

          <a
            href={broker.optOutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors flex items-center gap-1.5"
          >
            <span>Open {broker.name} Official Opt-Out</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-950" />
          </a>
        </div>
      </div>
    </div>
  );
};
