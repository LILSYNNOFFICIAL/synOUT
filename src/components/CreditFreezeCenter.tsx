import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Lock,
  Mail,
  Send,
  X,
} from 'lucide-react';
import { UserProfile } from '../types';
import {
  buildStatutoryFreezeLetter,
  computeCreditLockoutSummary,
  CREDIT_FREEZE_RAILS,
  CreditFreezeRailDefinition,
  CreditFreezeRecord,
  CreditFreezeStateMap,
  CreditFreezeStatus,
  FraudAlertMode,
  FreezeNoticeTemplateType,
  FreezeRailCategory,
} from '../utils/creditFreezeEngine';
import { buildWebmailComposeUrls } from '../utils/emailProviderConfig';
import { copyTextToClipboard } from '../utils/exportEngines';
import {
  sendEmailViaConnectedAccount,
  useEmailConnection,
} from '../services/emailConnectionStore';

interface CreditFreezeCenterProps {
  profile: UserProfile;
  freezeState: CreditFreezeStateMap;
  onUpdateFreezeState: (next: CreditFreezeStateMap) => void;
  onOpenConnectEmail: () => void;
}

type CategoryFilter = 'all' | FreezeRailCategory;

function downloadLetterFile(filename: string, content: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const CreditFreezeCenter: React.FC<CreditFreezeCenterProps> = ({
  profile,
  freezeState,
  onUpdateFreezeState,
  onOpenConnectEmail,
}) => {
  const {
    activeConnectedEmail,
    isDirectSendConnected,
    webmailSender,
  } = useEmailConnection();

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [letterModalRail, setLetterModalRail] = useState<CreditFreezeRailDefinition | null>(null);
  const [templateType, setTemplateType] = useState<FreezeNoticeTemplateType>('fcra_security_freeze');
  const [thawStart, setThawStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [thawEnd, setThawEnd] = useState(() => {
    const d = new Date(Date.now() + 7 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [copiedLetter, setCopiedLetter] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [dispatchFeedback, setDispatchFeedback] = useState<string | null>(null);

  const summary = useMemo(() => computeCreditLockoutSummary(freezeState), [freezeState]);

  const filteredRails = useMemo(() => {
    if (categoryFilter === 'all') return CREDIT_FREEZE_RAILS;
    return CREDIT_FREEZE_RAILS.filter((r) => r.category === categoryFilter);
  }, [categoryFilter]);

  const updateRailRecord = (railId: string, patch: Partial<CreditFreezeRecord>) => {
    const existing: CreditFreezeRecord = freezeState[railId] || {
      railId,
      status: 'unfrozen',
      fraudAlert: 'none',
      updatedAtIso: new Date().toISOString(),
    };
    onUpdateFreezeState({
      ...freezeState,
      [railId]: {
        ...existing,
        ...patch,
        updatedAtIso: new Date().toISOString(),
      },
    });
  };

  const generatedLetter = useMemo(() => {
    if (!letterModalRail) return null;
    return buildStatutoryFreezeLetter({
      rail: letterModalRail,
      profile,
      templateType,
      senderEmail: activeConnectedEmail || undefined,
      thawStartDate: thawStart,
      thawEndDate: thawEnd,
    });
  }, [letterModalRail, profile, templateType, activeConnectedEmail, thawStart, thawEnd]);

  const handleCopyLetter = async () => {
    if (!generatedLetter) return;
    const payload = `Subject: ${generatedLetter.subject}\n\n${generatedLetter.body}`;
    const copied = await copyTextToClipboard(payload);
    if (copied) {
      setCopiedLetter(true);
      setTimeout(() => setCopiedLetter(false), 2500);
    } else {
      downloadLetterFile('fcra-security-freeze-notice.txt', payload);
    }
  };

  const handleSendFreezeEmail = async () => {
    if (!letterModalRail || !generatedLetter || !letterModalRail.complianceEmail) return;
    setSendingEmail(true);
    setDispatchFeedback(null);
    try {
      const senderName =
        `${profile.firstName} ${profile.lastName}`.trim() || 'Protected Consumer';
      const sent = await sendEmailViaConnectedAccount({
        recipientEmail: letterModalRail.complianceEmail,
        subject: generatedLetter.subject,
        body: generatedLetter.body,
        senderName,
        brokerId: letterModalRail.id,
        brokerName: letterModalRail.name,
        brokerDomain: letterModalRail.complianceEmail.split('@')[1] || 'bureau.org',
        bccSelf: true,
      });
      updateRailRecord(letterModalRail.id, {
        status:
          freezeState[letterModalRail.id]?.status === 'frozen'
            ? 'frozen'
            : 'freeze_requested',
        emailReceiptId: sent.messageId,
      });
      setDispatchFeedback(`Sent formal FCRA § 605A notice · Receipt: ${sent.messageId}`);
    } catch (err) {
      setDispatchFeedback(
        err instanceof Error ? err.message : 'Unable to transmit email right now.'
      );
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header & Lockout KPI Overview */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
              <span className="text-emerald-400 font-medium">FCRA § 605A (15 U.S.C. § 1681c-1)</span>
              <span aria-hidden="true">·</span>
              <span>100% Free by Federal Law</span>
              <span aria-hidden="true">·</span>
              <span>Synced in Encrypted Vault</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white [text-wrap:balance]">
              Credit Freeze, Fraud Alert &amp; Identity Lockout Center
            </h1>
            <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
              Deleting data-broker profiles reduces exposure, while placing free federal security
              freezes across credit, deposit, telecom, and IRS/E-Verify rails prevents criminals
              from opening loans, bank accounts, or SIM-swapped lines with already-leaked records.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setLetterModalRail(CREDIT_FREEZE_RAILS[0]);
                setTemplateType('initial_fraud_alert_1yr');
                setDispatchFeedback(null);
              }}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Generate 1-Year Fraud Alert Letter</span>
            </button>
          </div>
        </div>

        {summary.expiringOrExpiredThaws.length > 0 && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-400/30 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2">
            <span>
              Temporary freeze thaw window reached on:{' '}
              <strong className="text-white">{summary.expiringOrExpiredThaws.join(', ')}</strong>.
              Confirm your file has re-locked and update status to Frozen.
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-white/[0.08] tabular-nums">
          <div className="space-y-1">
            <div className="text-xs text-slate-400">Locked &amp; Frozen Rails</div>
            <div className="text-2xl font-extrabold font-mono text-emerald-400">
              {summary.frozenCount} / {summary.totalRails}
            </div>
            <div className="text-[11px] text-slate-500">
              {summary.lockoutCoveragePercent}% total identity lockout
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-400">4 Credit Bureaus Frozen</div>
            <div className="text-2xl font-extrabold font-mono text-white">
              {summary.majorBureausFrozen} / {summary.majorBureausTotal}
            </div>
            <div className="text-[11px] text-slate-500">Equifax · Experian · TransUnion · Innovis</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-400">Active Fraud Alerts</div>
            <div className="text-2xl font-extrabold font-mono text-sky-300">
              {summary.activeFraudAlertsCount}
            </div>
            <div className="text-[11px] text-slate-500">1-Year Initial or 7-Year Extended</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-400">Temporarily Thawed</div>
            <div className="text-2xl font-extrabold font-mono text-amber-300">
              {summary.thawedCount}
            </div>
            <div className="text-[11px] text-slate-500">
              {summary.requestedCount} pending confirmation
            </div>
          </div>
        </div>
      </div>

      {/* Category Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-900/80 border border-white/[0.08]">
          {(
            [
              { id: 'all', label: 'All 9 Lockout Rails' },
              { id: 'major_credit_bureau', label: '4 Credit Bureaus' },
              { id: 'banking_telecom_specialty', label: 'Banking & Telecom' },
              { id: 'federal_identity_lock', label: 'IRS & DHS E-Verify' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategoryFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                categoryFilter === tab.id
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-400">
          Never enter or email full SSNs — store only non-sensitive confirmation references below.
        </div>
      </div>

      {/* Rails List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {filteredRails.map((rail) => {
          const rec = freezeState[rail.id];
          const status: CreditFreezeStatus = rec?.status || 'unfrozen';
          const fraudAlert: FraudAlertMode = rec?.fraudAlert || 'none';

          return (
            <div
              key={rail.id}
              className="glass-panel rounded-2xl p-5 sm:p-6 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                  <span>
                    {rail.categoryLabel} · {rail.slaSummary}
                  </span>
                  <span
                    className={`font-semibold ${
                      status === 'frozen'
                        ? 'text-emerald-400'
                        : status === 'temporarily_thawed'
                        ? 'text-amber-300'
                        : status === 'freeze_requested'
                        ? 'text-sky-300'
                        : 'text-rose-400'
                    }`}
                  >
                    {status === 'frozen'
                      ? 'Frozen & Locked'
                      : status === 'temporarily_thawed'
                      ? 'Temporarily Thawed'
                      : status === 'freeze_requested'
                      ? 'Freeze Requested'
                      : 'Unfrozen'}
                  </span>
                </div>

                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Lock
                    className={`w-4 h-4 shrink-0 ${
                      status === 'frozen' ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  />
                  <span>{rail.name}</span>
                </h2>

                <p className="text-xs text-slate-300 leading-relaxed">{rail.protectsAgainst}</p>

                <div className="text-[11px] text-slate-400 font-mono">
                  Phone: {rail.phoneNumber}
                </div>
              </div>

              {/* Interactive Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/[0.07]">
                <label className="space-y-1 text-xs">
                  <span className="text-slate-400 block">Freeze Status</span>
                  <select
                    value={status}
                    onChange={(e) =>
                      updateRailRecord(rail.id, {
                        status: e.target.value as CreditFreezeStatus,
                      })
                    }
                    className="w-full glass-input rounded-xl px-3 py-2 text-xs text-white cursor-pointer"
                  >
                    <option value="unfrozen">Unfrozen</option>
                    <option value="freeze_requested">Freeze Requested</option>
                    <option value="frozen">Frozen &amp; Locked</option>
                    <option value="temporarily_thawed">Temporarily Thawed</option>
                  </select>
                </label>

                {rail.supportsFraudAlert ? (
                  <label className="space-y-1 text-xs">
                    <span className="text-slate-400 block">FCRA Fraud Alert</span>
                    <select
                      value={fraudAlert}
                      onChange={(e) =>
                        updateRailRecord(rail.id, {
                          fraudAlert: e.target.value as FraudAlertMode,
                        })
                      }
                      className="w-full glass-input rounded-xl px-3 py-2 text-xs text-white cursor-pointer"
                    >
                      <option value="none">No Active Alert</option>
                      <option value="initial_1yr">1-Year Initial Alert</option>
                      <option value="extended_7yr">7-Year Extended Alert</option>
                      <option value="active_duty_1yr">1-Year Active Duty</option>
                    </select>
                  </label>
                ) : (
                  <label className="space-y-1 text-xs">
                    <span className="text-slate-400 block">Confirmation / Reference #</span>
                    <input
                      type="text"
                      value={rec?.referenceCode || ''}
                      onChange={(e) =>
                        updateRailRecord(rail.id, { referenceCode: e.target.value })
                      }
                      placeholder="Optional confirmation ID"
                      className="w-full glass-input rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </label>
                )}

                {rail.supportsFraudAlert && (
                  <label className="space-y-1 text-xs sm:col-span-2">
                    <span className="text-slate-400 block">Confirmation Reference (Never store PIN/SSN in plain shared notes)</span>
                    <input
                      type="text"
                      value={rec?.referenceCode || ''}
                      onChange={(e) =>
                        updateRailRecord(rail.id, { referenceCode: e.target.value })
                      }
                      placeholder="e.g. EQX-2026-CONFIRMED"
                      className="w-full glass-input rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </label>
                )}

                {status === 'temporarily_thawed' && (
                  <label className="space-y-1 text-xs sm:col-span-2">
                    <span className="text-amber-300 block font-medium">
                      Automatic Re-Freeze Date (Thaw Expiration)
                    </span>
                    <input
                      type="date"
                      value={rec?.thawExpiresDate || ''}
                      onChange={(e) =>
                        updateRailRecord(rail.id, { thawExpiresDate: e.target.value })
                      }
                      className="w-full glass-input rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </label>
                )}
              </div>

              {/* Action Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <a
                  href={rail.portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <span>Open Official Freeze Portal</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  type="button"
                  onClick={() => {
                    setLetterModalRail(rail);
                    setTemplateType('fcra_security_freeze');
                    setDispatchFeedback(null);
                  }}
                  className="px-3.5 py-2 rounded-xl glass-subtle hover:border-white/20 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <FileText className="w-3.5 h-3.5 text-sky-400" />
                  <span>Draft FCRA Notice</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Statutory FCRA § 605A Letter Modal */}
      {letterModalRail && generatedLetter && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`FCRA Statutory Freeze Notice for ${letterModalRail.name}`}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="glass-panel rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-7 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs text-emerald-400 font-medium">
                  {letterModalRail.statutoryAuthority}
                </div>
                <h3 className="text-xl font-bold text-white">{letterModalRail.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setLetterModalRail(null)}
                aria-label="Close statutory notice dialog"
                className="p-2 rounded-xl glass-subtle text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Template Selector */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-950/70 border border-white/[0.08]">
              {(
                [
                  { id: 'fcra_security_freeze', label: 'Place Security Freeze' },
                  ...(letterModalRail.supportsFraudAlert
                    ? [
                        { id: 'initial_fraud_alert_1yr' as const, label: '1-Year Fraud Alert' },
                        { id: 'extended_fraud_alert_7yr' as const, label: '7-Year Extended Alert' },
                      ]
                    : []),
                  { id: 'temporary_thaw_lift', label: 'Temporary Thaw Lift' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplateType(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    templateType === t.id
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {templateType === 'temporary_thaw_lift' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="text-slate-400 block">Lift Start Date</span>
                  <input
                    type="date"
                    value={thawStart}
                    onChange={(e) => setThawStart(e.target.value)}
                    className="w-full glass-input rounded-xl px-3 py-2 text-white font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-400 block">Automatic Re-Freeze Date</span>
                  <input
                    type="date"
                    value={thawEnd}
                    onChange={(e) => setThawEnd(e.target.value)}
                    className="w-full glass-input rounded-xl px-3 py-2 text-white font-mono"
                  />
                </label>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-xs font-mono text-slate-300 break-words">
                <span className="text-slate-500">Subject: </span>
                {generatedLetter.subject}
              </div>
              <pre className="p-4 rounded-2xl bg-slate-950/80 border border-white/[0.08] text-xs text-slate-200 font-mono whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                {generatedLetter.body}
              </pre>
            </div>

            {dispatchFeedback && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-400/30 text-xs text-emerald-200">
                {dispatchFeedback}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-white/[0.08]">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLetter}
                  className="px-3.5 py-2 rounded-xl glass-subtle hover:border-white/20 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  {copiedLetter ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied Notice</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>Copy Notice</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadLetterFile(
                      `${letterModalRail.id}-${templateType}.txt`,
                      `Subject: ${generatedLetter.subject}\n\n${generatedLetter.body}`
                    )
                  }
                  className="px-3.5 py-2 rounded-xl glass-subtle hover:border-white/20 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Download Printable (.txt)</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {letterModalRail.complianceEmail && isDirectSendConnected ? (
                  <button
                    type="button"
                    disabled={sendingEmail}
                    onClick={handleSendFreezeEmail}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{sendingEmail ? 'Sending...' : 'Send via Connected Email'}</span>
                  </button>
                ) : letterModalRail.complianceEmail && webmailSender ? (
                  <a
                    href={(() => {
                      const urls = buildWebmailComposeUrls(
                        letterModalRail.complianceEmail,
                        generatedLetter.subject,
                        generatedLetter.body
                      );
                      if (webmailSender.preferredLauncher === 'gmail') return urls.gmailUrl;
                      if (webmailSender.preferredLauncher === 'outlook') return urls.outlookUrl;
                      if (webmailSender.preferredLauncher === 'yahoo') return urls.yahooUrl;
                      return urls.mailtoUrl;
                    })()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Compose in Webmail</span>
                  </a>
                ) : letterModalRail.complianceEmail ? (
                  <button
                    type="button"
                    onClick={() => {
                      setLetterModalRail(null);
                      onOpenConnectEmail();
                    }}
                    className="px-4 py-2 rounded-xl glass-subtle hover:border-white/20 text-sky-300 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Connect Email to Send</span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
