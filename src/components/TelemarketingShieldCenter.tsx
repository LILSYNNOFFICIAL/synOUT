import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Mail,
  PhoneOff,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';
import { UserProfile } from '../types';
import {
  buildTcpaRevocationDemand,
  calculateTcpaDamages,
  DO_NOT_CONTACT_RAILS,
  exportTcpaViolationsCsv,
  TcpaChannelType,
  TcpaViolationEntry,
  TelemarketingShieldState,
} from '../utils/telemarketingShieldEngine';
import { buildWebmailComposeUrls } from '../utils/emailProviderConfig';
import { copyTextToClipboard } from '../utils/exportEngines';
import {
  sendEmailViaConnectedAccount,
  useEmailConnection,
} from '../services/emailConnectionStore';

interface TelemarketingShieldCenterProps {
  profile: UserProfile;
  shieldState: TelemarketingShieldState;
  onUpdateShieldState: (next: TelemarketingShieldState) => void;
  onOpenConnectEmail: () => void;
}

type ShieldSubTab = 'registries' | 'revocation_ledger';

function downloadShieldFile(filename: string, content: string, mimeType: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const TelemarketingShieldCenter: React.FC<TelemarketingShieldCenterProps> = ({
  profile,
  shieldState,
  onUpdateShieldState,
  onOpenConnectEmail,
}) => {
  const { activeConnectedEmail, isDirectSendConnected, webmailSender } =
    useEmailConnection();

  const [subTab, setSubTab] = useState<ShieldSubTab>('registries');
  const [callerName, setCallerName] = useState('');
  const [callerPhone, setCallerPhone] = useState('');
  const [callerEmail, setCallerEmail] = useState('');
  const [channel, setChannel] = useState<TcpaChannelType>('robocall');
  const [willfulViolation, setWillfulViolation] = useState(false);
  const [notes, setNotes] = useState('');
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [copiedSms, setCopiedSms] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [sendingNotice, setSendingNotice] = useState(false);
  const [sendFeedback, setSendFeedback] = useState<string | null>(null);

  const userStateCode = (profile.currentState || 'CA').trim().toUpperCase();

  const sortedRails = useMemo(() => {
    return [...DO_NOT_CONTACT_RAILS].sort((a, b) => {
      const aMatchesState = a.stateCode === userStateCode ? 1 : 0;
      const bMatchesState = b.stateCode === userStateCode ? 1 : 0;
      if (aMatchesState !== bMatchesState) return bMatchesState - aMatchesState;
      const aNational = a.scope !== 'state' ? 1 : 0;
      const bNational = b.scope !== 'state' ? 1 : 0;
      return bNational - aNational;
    });
  }, [userStateCode]);

  const damages = useMemo(
    () => calculateTcpaDamages(shieldState.violations),
    [shieldState.violations]
  );

  const selectedEntry = useMemo(() => {
    if (selectedEntryId) {
      const found = shieldState.violations.find((v) => v.id === selectedEntryId);
      if (found) return found;
    }
    return shieldState.violations[0] || null;
  }, [shieldState.violations, selectedEntryId]);

  const activeDemand = useMemo(() => {
    const targetName = selectedEntry?.callerName || callerName.trim() || 'Telemarketing Entity';
    const targetPhone = selectedEntry?.callerPhone || callerPhone.trim() || '(800) 555-0199';
    const targetEmail = selectedEntry?.callerEmail || callerEmail.trim() || undefined;
    const targetChannel = selectedEntry?.channel || channel;

    return buildTcpaRevocationDemand({
      callerName: targetName,
      callerPhone: targetPhone,
      callerEmail: targetEmail,
      channel: targetChannel,
      profile,
      senderEmail: activeConnectedEmail || undefined,
    });
  }, [selectedEntry, callerName, callerPhone, callerEmail, channel, profile, activeConnectedEmail]);

  const toggleRegistryCompleted = (railId: string) => {
    const exists = shieldState.completedRegistryIds.includes(railId);
    const nextIds = exists
      ? shieldState.completedRegistryIds.filter((id) => id !== railId)
      : [...shieldState.completedRegistryIds, railId];

    onUpdateShieldState({
      ...shieldState,
      completedRegistryIds: nextIds,
      updatedAtIso: new Date().toISOString(),
    });
  };

  const handleAddViolationCaller = (e: React.FormEvent) => {
    e.preventDefault();
    if (!callerName.trim() || !callerPhone.trim()) return;

    const newEntry: TcpaViolationEntry = {
      id: `tcpa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      callerName: callerName.trim(),
      callerPhone: callerPhone.trim(),
      callerEmail: callerEmail.trim() || undefined,
      channel,
      revocationSentAtIso: new Date().toISOString().slice(0, 10),
      postRevocationCallDates: [],
      willfulViolation,
      notes: notes.trim() || undefined,
    };

    const nextViolations = [newEntry, ...shieldState.violations];
    onUpdateShieldState({
      ...shieldState,
      violations: nextViolations,
      updatedAtIso: new Date().toISOString(),
    });
    setSelectedEntryId(newEntry.id);
    setCallerName('');
    setCallerPhone('');
    setCallerEmail('');
    setNotes('');
    setWillfulViolation(false);
    setSendFeedback(null);
  };

  const handleLogRepeatCall = (entryId: string) => {
    const todayStamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const nextViolations = shieldState.violations.map((v) =>
      v.id === entryId
        ? { ...v, postRevocationCallDates: [...v.postRevocationCallDates, todayStamp] }
        : v
    );
    onUpdateShieldState({
      ...shieldState,
      violations: nextViolations,
      updatedAtIso: new Date().toISOString(),
    });
  };

  const handleToggleWillful = (entryId: string) => {
    const nextViolations = shieldState.violations.map((v) =>
      v.id === entryId ? { ...v, willfulViolation: !v.willfulViolation } : v
    );
    onUpdateShieldState({
      ...shieldState,
      violations: nextViolations,
      updatedAtIso: new Date().toISOString(),
    });
  };

  const handleDeleteEntry = (entryId: string) => {
    const nextViolations = shieldState.violations.filter((v) => v.id !== entryId);
    onUpdateShieldState({
      ...shieldState,
      violations: nextViolations,
      updatedAtIso: new Date().toISOString(),
    });
    if (selectedEntryId === entryId) {
      setSelectedEntryId(null);
    }
  };

  const handleSendDirectRevocation = async () => {
    const recipient = selectedEntry?.callerEmail || callerEmail.trim();
    if (!recipient) return;
    setSendingNotice(true);
    setSendFeedback(null);
    try {
      const senderName =
        `${profile.firstName} ${profile.lastName}`.trim() || 'Protected Subscriber';
      const sent = await sendEmailViaConnectedAccount({
        recipientEmail: recipient,
        subject: activeDemand.subject,
        body: activeDemand.emailBody,
        senderName,
        brokerId: selectedEntry?.id || 'tcpa-revocation',
        brokerName: selectedEntry?.callerName || callerName.trim() || 'Caller',
        brokerDomain: recipient.split('@')[1] || 'caller.com',
        bccSelf: true,
      });
      setSendFeedback(`Dispatched formal TCPA revocation notice · Receipt: ${sent.messageId}`);
    } catch (err) {
      setSendFeedback(err instanceof Error ? err.message : 'Unable to send notice right now.');
    } finally {
      setSendingNotice(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header & Damages / Enrollment KPIs */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
              <span className="text-emerald-400 font-medium">
                TCPA 47 U.S.C. § 227 &amp; 47 CFR § 64.1200(a)(10)
              </span>
              <span aria-hidden="true">·</span>
              <span>10-Business-Day Mandatory Revocation Rule</span>
              <span aria-hidden="true">·</span>
              <span>$500–$1,500 Per Illegal Call/Text</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white [text-wrap:balance]">
              Robocall, Spam Text &amp; Do-Not-Contact Shield
            </h1>
            <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
              Cut off downstream telemarketing, smishing texts, B2B cold-dialers, and pre-screened
              credit mailers — and document post-revocation calls for statutory TCPA enforcement.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/70 border border-white/[0.08] shrink-0">
            <button
              type="button"
              onClick={() => setSubTab('registries')}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                subTab === 'registries'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Do-Not-Contact Registries
            </button>
            <button
              type="button"
              onClick={() => setSubTab('revocation_ledger')}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                subTab === 'revocation_ledger'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              TCPA Revocation &amp; Ledger
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-white/[0.08] tabular-nums">
          <div className="space-y-1">
            <div className="text-xs text-slate-400">Registries Enrolled</div>
            <div className="text-2xl font-extrabold font-mono text-emerald-400">
              {shieldState.completedRegistryIds.length} / {DO_NOT_CONTACT_RAILS.length}
            </div>
            <div className="text-[11px] text-slate-500">FTC DNC · OptOutPrescreen · State Lists</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-400">Revoked Callers Tracked</div>
            <div className="text-2xl font-extrabold font-mono text-white">
              {damages.totalTrackedCallers}
            </div>
            <div className="text-[11px] text-slate-500">Formal 47 CFR § 64.1200 revocations</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-400">Post-Revocation Violations</div>
            <div className="text-2xl font-extrabold font-mono text-rose-400">
              {damages.totalPostRevocationCalls}
            </div>
            <div className="text-[11px] text-slate-500">Logged repeat calls or texts</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-400">Statutory Damages Ledger</div>
            <div className="text-2xl font-extrabold font-mono text-amber-300">
              ${damages.treblePotentialDamagesUsd.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500">
              Base $500 floor: ${damages.baseStatutoryDamagesUsd.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {subTab === 'registries' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {sortedRails.map((rail) => {
            const isDone = shieldState.completedRegistryIds.includes(rail.id);
            const matchesUserState = rail.stateCode === userStateCode;

            return (
              <div
                key={rail.id}
                className="glass-panel rounded-2xl p-5 sm:p-6 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                    <span>
                      {rail.scope === 'national'
                        ? 'Federal Registry'
                        : rail.scope === 'prescreen_mail'
                        ? 'Credit & Direct Mail Suppression'
                        : rail.scope === 'carrier_shield'
                        ? 'Carrier Network Firewall'
                        : `State Registry (${rail.stateCode})`}
                      {matchesUserState ? ` · Matches Your State (${userStateCode})` : ''}
                    </span>
                    <span className={isDone ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                      {isDone ? 'Enrolled' : 'Not Yet Marked'}
                    </span>
                  </div>

                  <h2 className="text-lg font-bold text-white">{rail.name}</h2>
                  <p className="text-xs text-slate-300 leading-relaxed">{rail.effectSummary}</p>
                  <div className="text-[11px] text-slate-400">{rail.authority}</div>
                  {rail.phoneAction && (
                    <div className="text-[11px] font-mono text-sky-300">{rail.phoneAction}</div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-white/[0.07]">
                  <a
                    href={rail.portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <span>Open Official Registry</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <button
                    type="button"
                    onClick={() => toggleRegistryCompleted(rail.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      isDone
                        ? 'bg-emerald-500/15 border border-emerald-400/30 text-emerald-300'
                        : 'glass-subtle hover:border-white/20 text-slate-200'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{isDone ? 'Completed' : 'Mark Enrolled'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Log Caller + Track Violations */}
          <div className="lg:col-span-6 space-y-6">
            <form
              onSubmit={handleAddViolationCaller}
              className="glass-panel rounded-3xl p-6 space-y-4"
            >
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <PhoneOff className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Log Unwanted Caller or Smishing Sender</span>
                </h2>
                <p className="text-xs text-slate-400">
                  Records your formal revocation date and prepares an enforceable 47 CFR § 64.1200
                  demand + 160-character SMS STOP revocation.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="text-slate-300 block">Caller / Company Name *</span>
                  <input
                    type="text"
                    required
                    value={callerName}
                    onChange={(e) => setCallerName(e.target.value)}
                    placeholder="e.g. National Auto Warranty Corp"
                    className="w-full glass-input rounded-xl px-3 py-2 text-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300 block">Originating Number / Short Code *</span>
                  <input
                    type="tel"
                    required
                    value={callerPhone}
                    onChange={(e) => setCallerPhone(e.target.value)}
                    placeholder="(800) 555-0142 or 55291"
                    className="w-full glass-input rounded-xl px-3 py-2 text-white font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300 block">Compliance Email (Optional)</span>
                  <input
                    type="email"
                    value={callerEmail}
                    onChange={(e) => setCallerEmail(e.target.value)}
                    placeholder="compliance@company.com"
                    className="w-full glass-input rounded-xl px-3 py-2 text-white font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300 block">Channel</span>
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as TcpaChannelType)}
                    className="w-full glass-input rounded-xl px-3 py-2 text-white cursor-pointer"
                  >
                    <option value="robocall">Prerecorded / ATDS Robocall</option>
                    <option value="robotext">Automated SMS / Smishing Text</option>
                    <option value="live_telemarketing">Live DNC Telemarketing Call</option>
                    <option value="b2b_cold_call">B2B Lead-Broker Cold Dial</option>
                  </select>
                </label>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={willfulViolation}
                  onChange={(e) => setWillfulViolation(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-950 text-emerald-500 cursor-pointer"
                />
                <span>
                  Flag as knowing/willful post-notice violation ($1,500 treble statutory rate under
                  47 U.S.C. § 227(b)(3))
                </span>
              </label>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Caller to Revocation Ledger</span>
                </button>
              </div>
            </form>

            {/* Logged Violators List */}
            <div className="glass-panel rounded-3xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-bold text-white">
                  Tracked Callers &amp; Post-Revocation Violations
                </h3>
                {shieldState.violations.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      downloadShieldFile(
                        `synout-tcpa-violations-${new Date().toISOString().slice(0, 10)}.csv`,
                        exportTcpaViolationsCsv(shieldState.violations),
                        'text/csv;charset=utf-8'
                      )
                    }
                    className="px-3 py-1.5 rounded-xl glass-subtle hover:border-white/20 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Export Evidence (.csv)</span>
                  </button>
                )}
              </div>

              {shieldState.violations.length === 0 ? (
                <p className="text-xs text-slate-400 leading-relaxed">
                  No callers logged yet. Add an unwanted robocaller or spam texter above to generate
                  a formal revocation notice and track any subsequent $500–$1,500 violations.
                </p>
              ) : (
                <div className="space-y-3">
                  {shieldState.violations.map((entry) => {
                    const count = entry.postRevocationCallDates.length;
                    const entryUsd = count * (entry.willfulViolation ? 1500 : 500);
                    const isSelected = selectedEntry?.id === entry.id;

                    return (
                      <div
                        key={entry.id}
                        onClick={() => setSelectedEntryId(entry.id)}
                        className={`p-4 rounded-2xl border transition-colors cursor-pointer space-y-2.5 tabular-nums ${
                          isSelected
                            ? 'bg-emerald-500/10 border-emerald-400/40'
                            : 'bg-slate-950/50 border-white/[0.08] hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-bold text-white">{entry.callerName}</div>
                            <div className="text-xs font-mono text-slate-400">
                              {entry.callerPhone} · Revoked {entry.revocationSentAtIso}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-mono font-bold text-amber-300">
                              ${entryUsd.toLocaleString()}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {count} post-notice call(s)
                            </div>
                          </div>
                        </div>

                        <div
                          className="flex flex-wrap items-center justify-between gap-2 pt-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleLogRepeatCall(entry.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Log Illegal Repeat Call</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleWillful(entry.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 text-xs cursor-pointer whitespace-nowrap"
                            >
                              {entry.willfulViolation ? 'Rate: $1,500 Willful' : 'Rate: $500 Base'}
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteEntry(entry.id)}
                            aria-label={`Remove ${entry.callerName}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: Generated SMS + Email Statutory Revocation Notice */}
          <div className="lg:col-span-6 glass-panel rounded-3xl p-6 space-y-5">
            <div className="space-y-1">
              <div className="text-xs text-emerald-400 font-medium">
                Ready-to-Send Revocation Instruments
              </div>
              <h2 className="text-lg font-bold text-white">
                SMS Reply &amp; Written 47 U.S.C. § 227 Demand
              </h2>
            </div>

            {/* 160-Char SMS Revocation Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-200">
                  1-Click SMS / Text Reply Revocation
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    const copied = await copyTextToClipboard(activeDemand.smsReplyText);
                    if (copied) {
                      setCopiedSms(true);
                      setTimeout(() => setCopiedSms(false), 2200);
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg glass-subtle text-emerald-300 font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  {copiedSms ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedSms ? 'Copied SMS' : 'Copy SMS Reply'}</span>
                </button>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-white/[0.08] text-xs font-mono text-emerald-200 leading-relaxed">
                {activeDemand.smsReplyText}
              </div>
            </div>

            {/* Formal Written Legal Demand */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-200">
                Formal Written Legal &amp; Compliance Demand
              </div>
              <pre className="p-4 rounded-2xl bg-slate-950/80 border border-white/[0.08] text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                {activeDemand.emailBody}
              </pre>
            </div>

            {sendFeedback && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-400/30 text-xs text-emerald-200">
                {sendFeedback}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={async () => {
                  const full = `Subject: ${activeDemand.subject}\n\n${activeDemand.emailBody}`;
                  const copied = await copyTextToClipboard(full);
                  if (copied) {
                    setCopiedEmail(true);
                    setTimeout(() => setCopiedEmail(false), 2200);
                  } else {
                    downloadShieldFile('tcpa-revocation-demand.txt', full, 'text/plain;charset=utf-8');
                  }
                }}
                className="px-3.5 py-2 rounded-xl glass-subtle hover:border-white/20 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {copiedEmail ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied Demand</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Copy Full Notice</span>
                  </>
                )}
              </button>

              {(selectedEntry?.callerEmail || callerEmail.trim()) ? (
                isDirectSendConnected ? (
                  <button
                    type="button"
                    disabled={sendingNotice}
                    onClick={handleSendDirectRevocation}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{sendingNotice ? 'Sending...' : 'Send via Connected Email'}</span>
                  </button>
                ) : webmailSender ? (
                  <a
                    href={(() => {
                      const urls = buildWebmailComposeUrls(
                        selectedEntry?.callerEmail || callerEmail.trim(),
                        activeDemand.subject,
                        activeDemand.emailBody
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
                ) : (
                  <button
                    type="button"
                    onClick={onOpenConnectEmail}
                    className="px-4 py-2 rounded-xl glass-subtle hover:border-white/20 text-sky-300 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Connect Email to Send</span>
                  </button>
                )
              ) : (
                <a
                  href="https://consumercomplaints.fcc.gov/hc/en-us"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-xl glass-subtle hover:border-white/20 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <span>File FCC Complaint</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
