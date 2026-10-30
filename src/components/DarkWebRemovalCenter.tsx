import React, { useState, useMemo, useEffect } from 'react';
import { UserProfile, ScanResult } from '../types';
import {
  DarkWebFinding,
  DirectLinkQueryType,
  generateDarkWebFindingsForProfile,
  generateDirectDarkWebLinks,
  buildSourceTakedownNotice,
} from '../utils/darkWebEngine';
import {
  useEmailConnection,
  sendEmailViaConnectedAccount,
} from '../services/emailConnectionStore';
import { copyTextToClipboard } from '../utils/exportEngines';
import { isStaticServerlessRuntime } from '../utils/serverlessRuntime';
import {
  Skull,
  Globe,
  ShieldAlert,
  ExternalLink,
  Copy,
  Check,
  Send,
  Terminal,
  FileText,
  CheckCircle2,
  Search,
  Key,
  RotateCcw,
  Link2,
  CheckSquare,
  Square,
  ChevronRight,
  Lock,
  AlertTriangle,
  Mail,
  X,
} from 'lucide-react';

interface DarkWebRemovalCenterProps {
  profile: UserProfile;
  results: ScanResult[];
  onOpenConnectEmail?: () => void;
}

export const DarkWebRemovalCenter: React.FC<DarkWebRemovalCenterProps> = ({
  profile,
  results,
  onOpenConnectEmail,
}) => {
  const { isDirectSendConnected, activeConnectedEmail } = useEmailConnection();
  const initialFindings = useMemo(
    () => generateDarkWebFindingsForProfile(profile, results),
    [profile, results]
  );

  const [findings, setFindings] = useState<DarkWebFinding[]>(initialFindings);
  const [selectedFindingId, setSelectedFindingId] = useState<string>(initialFindings[0]?.id || '');
  const [activeTab, setActiveTab] = useState<'findings' | 'link-generator' | 'automation'>('findings');

  // Track step-by-step completion per finding ID: Record<findingId, number[]>
  const [completedStepsByFinding, setCompletedStepsByFinding] = useState<Record<string, number[]>>({});

  // Clipboard states
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Dispatch states
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchSuccess, setDispatchSuccess] = useState<string | null>(null);

  // Direct Deep/Dark Web Link Generator state
  const primaryEmail = profile.emails[0] || activeConnectedEmail || 'yourname@email.com';
  const primaryPhone = profile.phoneNumbers[0] || '';
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const emailHandle = primaryEmail.split('@')[0] || profile.lastName.toLowerCase();

  const [generatorQuery, setGeneratorQuery] = useState<string>(primaryEmail);
  const [generatorType, setGeneratorType] = useState<DirectLinkQueryType>('email');

  useEffect(() => {
    setFindings(initialFindings);
    if (initialFindings.length > 0 && !initialFindings.some((f) => f.id === selectedFindingId)) {
      setSelectedFindingId(initialFindings[0].id);
    }
  }, [initialFindings, selectedFindingId]);

  const selectedFinding = useMemo(
    () => findings.find((f) => f.id === selectedFindingId) || findings[0],
    [findings, selectedFindingId]
  );

  const generatedLinks = useMemo(
    () => generateDirectDarkWebLinks(generatorQuery, generatorType, profile.currentState),
    [generatorQuery, generatorType, profile.currentState]
  );

  const copyWithFeedback = (key: string, value: string) => {
    void copyTextToClipboard(value);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2000);
  };

  const toggleManualStep = (findingId: string, stepNumber: number) => {
    setCompletedStepsByFinding((prev) => {
      const existing = prev[findingId] || [];
      const exists = existing.includes(stepNumber);
      const updated = exists
        ? existing.filter((s) => s !== stepNumber)
        : [...existing, stepNumber];

      const targetFinding = findings.find((f) => f.id === findingId);
      if (targetFinding && updated.length === targetFinding.manualRemovalSteps.length) {
        setFindings((curr) =>
          curr.map((item) => (item.id === findingId ? { ...item, status: 'purged' } : item))
        );
      }
      return { ...prev, [findingId]: updated };
    });
  };

  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [pendingConfirmTargets, setPendingConfirmTargets] = useState<DarkWebFinding[] | null>(null);

  const handleTakedownDispatch = (finding: DarkWebFinding) => {
    setDispatchError(null);
    setDispatchSuccess(null);
    if (!isDirectSendConnected) {
      setDispatchError(
        'Connect your email account first so synOUT can send this statutory takedown email directly from your address.'
      );
      return;
    }
    setPendingConfirmTargets([finding]);
  };

  const handleBatchTakedownDispatch = () => {
    setDispatchError(null);
    setDispatchSuccess(null);
    if (!isDirectSendConnected) {
      setDispatchError(
        'Connect your email account first so synOUT can send all dark web & deep web takedown emails on your behalf.'
      );
      return;
    }
    const activeTargets = findings.filter((f) => f.status !== 'purged');
    setPendingConfirmTargets(activeTargets.length > 0 ? activeTargets : findings);
  };

  const executeConfirmedDarkWebSend = async () => {
    if (!pendingConfirmTargets || pendingConfirmTargets.length === 0) return;
    const targets = pendingConfirmTargets;
    setPendingConfirmTargets(null);
    setIsDispatching(true);
    setDispatchError(null);
    setDispatchSuccess(null);

    let sentCount = 0;
    const errors: string[] = [];
    const senderName = `${profile.firstName} ${profile.lastName}`.trim() || 'Authorized Consumer';

    for (const f of targets) {
      try {
        const noticeBody = buildSourceTakedownNotice(f, {
          ...profile,
          emails: activeConnectedEmail ? [activeConnectedEmail] : profile.emails,
        });
        const subject = `FORMAL PII ERASURE & ABUSE TAKEDOWN DEMAND (${f.sourceName}) - ${senderName}`;

        const mailRes = await sendEmailViaConnectedAccount({
          recipientEmail: f.hostContact,
          subject,
          body: noticeBody,
          senderName,
          brokerId: f.id,
          brokerName: f.sourceName,
          brokerDomain: f.hostContact,
        });

        if (!isStaticServerlessRuntime()) {
          await fetch('/api/darkweb/dispatch-takedown', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourceTitle: f.sourceName,
              hostContact: f.hostContact,
              sourceCategory: f.sourceCategory,
            }),
          }).catch(() => null);
        }

        sentCount++;
        setFindings((prev) =>
          prev.map((item) =>
            item.id === f.id && item.status === 'active'
              ? { ...item, status: 'takedown_dispatched' }
              : item
          )
        );

        if (targets.length === 1) {
          setDispatchSuccess(
            `Sent real takedown email from ${mailRes.sentFrom} to ${f.hostContact} · Receipt: ${mailRes.messageId}`
          );
        }
      } catch (err) {
        errors.push(`${f.sourceName}: ${err instanceof Error ? err.message : 'Send failed'}`);
      }
    }

    if (targets.length > 1) {
      if (sentCount > 0) {
        setDispatchSuccess(
          `Sent ${sentCount} of ${targets.length} dark web & host abuse takedown emails from ${activeConnectedEmail}.`
        );
      }
      if (errors.length > 0) {
        setDispatchError(errors[0]);
      }
    } else if (errors.length > 0) {
      setDispatchError(errors[0]);
    }

    setIsDispatching(false);
  };

  const selectedStepsCompleted = selectedFinding
    ? completedStepsByFinding[selectedFinding.id] || []
    : [];
  const totalStepsForSelected = selectedFinding ? selectedFinding.manualRemovalSteps.length : 1;
  const stepProgressPct = Math.round((selectedStepsCompleted.length / totalStepsForSelected) * 100);

  const sourceTakedownNotice = useMemo(
    () => (selectedFinding ? buildSourceTakedownNotice(selectedFinding, profile) : ''),
    [selectedFinding, profile]
  );

  const presetSelectors: { label: string; value: string; type: DirectLinkQueryType }[] = [
    { label: `Email (${primaryEmail})`, value: primaryEmail, type: 'email' },
    { label: `Full Name (${fullName})`, value: fullName, type: 'name' },
    { label: `Handle (${emailHandle})`, value: emailHandle, type: 'username' },
    ...(primaryPhone
      ? [{ label: `Phone (${primaryPhone})`, value: primaryPhone, type: 'phone' as DirectLinkQueryType }]
      : []),
    {
      label: `Location (${profile.currentCity}, ${profile.currentState})`,
      value: `${fullName} ${profile.currentCity}`,
      type: 'address',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 glass-panel rounded-2xl space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
              <span className="text-rose-400 font-semibold flex items-center gap-1.5">
                <Skull className="w-3.5 h-3.5" /> Deep & Dark Web Neutralization
              </span>
              <span aria-hidden="true">·</span>
              <span>Tor v3 .onion Indexes</span>
              <span aria-hidden="true">·</span>
              <span>Infostealer Logs & Paste Archives</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Dark Web Links & Source-Specific Removal Center
            </h1>
            <p className="text-sm text-slate-300/90 max-w-3xl leading-relaxed">
              Generate direct Tor <code className="text-emerald-400 font-mono">.onion</code> and deep web inspection links for every exposed selector, dispatch automated host abuse notices, or follow the integrated step-by-step manual removal walkthrough tailored to each specific leak source.
            </p>
          </div>

          <div className="flex items-center gap-6 text-xs text-slate-400 border-t lg:border-t-0 pt-3 lg:pt-0 border-white/[0.08] tabular-nums">
            <div>
              <span className="block text-slate-400 font-mono">Active Sources</span>
              <span className="text-lg font-extrabold text-white font-mono tabular-nums">
                {findings.filter((f) => f.status === 'active').length} / {findings.length}
              </span>
            </div>
            <div className="h-8 w-px bg-white/[0.08]" />
            <div>
              <span className="block text-slate-400 font-mono">Actioned / Purged</span>
              <span className="text-lg font-extrabold text-emerald-400 font-mono tabular-nums">
                {findings.filter((f) => f.status !== 'active').length}
              </span>
            </div>
          </div>
        </div>

        {/* Interactive Mode Switcher (Segmented Functional Controls) */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 glass-subtle rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('findings')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'findings'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-300 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Findings & Source Removal Guides ({findings.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('link-generator')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'link-generator'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-300 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <Link2 className="w-4 h-4" />
            <span>Direct Deep / Dark Web Link Generator</span>
          </button>

          <button
            onClick={() => setActiveTab('automation')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'automation'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-300 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>Batch Automated Takedown</span>
          </button>
        </div>
      </div>

      {/* TAB 1: FINDINGS + DIRECT LINKS + INTEGRATED STEP-BY-STEP REMOVAL GUIDE PER SOURCE */}
      {activeTab === 'findings' && selectedFinding && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Source Queue */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Detected Deep & Dark Web Sources
              </h2>
              <span className="text-xs text-slate-500 font-mono">Select source</span>
            </div>

            <div className="space-y-2.5">
              {findings.map((f) => {
                const isSelected = f.id === selectedFinding.id;
                const doneCount = (completedStepsByFinding[f.id] || []).length;
                const totalCount = f.manualRemovalSteps.length;

                return (
                  <button
                    key={f.id}
                    onClick={() => {
                      setSelectedFindingId(f.id);
                      setDispatchSuccess(null);
                    }}
                    className={`w-full text-left p-4 rounded-xl transition-all cursor-pointer space-y-2 glass-card ${
                      isSelected
                        ? '!border-emerald-400/55 !bg-emerald-500/[0.08] shadow-lg shadow-emerald-500/5'
                        : ''
                    }`}
                  >
                    {/* Unboxed inline metadata row */}
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-slate-400">{f.sourceCategory}</span>
                      <span
                        className={
                          f.severity === 'Critical'
                            ? 'text-rose-400 font-semibold'
                            : f.severity === 'High'
                            ? 'text-amber-400 font-semibold'
                            : 'text-sky-400 font-semibold'
                        }
                      >
                        {f.severity} Risk
                      </span>
                    </div>

                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold text-white leading-snug">{f.title}</h3>
                      <ChevronRight
                        className={`w-4 h-4 shrink-0 mt-0.5 transition-transform ${
                          isSelected ? 'text-emerald-400 translate-x-0.5' : 'text-slate-500'
                        }`}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1.5 border-t border-white/[0.07] tabular-nums">
                      <span>
                        Manual Guide: {doneCount}/{totalCount} steps
                      </span>
                      <span
                        className={`font-semibold ${
                          f.status === 'purged'
                            ? 'text-emerald-400'
                            : f.status === 'takedown_dispatched'
                            ? 'text-sky-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {f.status === 'purged'
                          ? 'Verified Purged'
                          : f.status === 'takedown_dispatched'
                          ? 'Notice Dispatched'
                          : 'Active Exposure'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Selected Finding Direct Links + Source-Specific Step-by-Step Removal Guide */}
          <div className="lg:col-span-8 space-y-6">
            <div className="p-6 sm:p-7 glass-panel rounded-2xl space-y-6">
              {/* Source Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-white/[0.08]">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
                    <span className="text-emerald-400 font-semibold">{selectedFinding.sourceCategory}</span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedFinding.sourceName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedFinding.dateDiscovered}</span>
                  </div>
                  <h2 className="text-xl font-bold text-white">{selectedFinding.title}</h2>
                  <p className="text-xs text-slate-400">
                    Legal Framework: <span className="text-slate-300">{selectedFinding.legalRegime}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleTakedownDispatch(selectedFinding)}
                    disabled={isDispatching || selectedFinding.status !== 'active'}
                    className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-xs font-bold text-white transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    {isDispatching ? (
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {selectedFinding.status === 'purged'
                        ? 'Source Purged'
                        : selectedFinding.status === 'takedown_dispatched'
                        ? 'Takedown Sent'
                        : '1-Click Auto Takedown'}
                    </span>
                  </button>
                </div>
              </div>

              {dispatchSuccess && (
                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                  <span>{dispatchSuccess}</span>
                </div>
              )}

              {/* SECTION A: Direct Deep Web, Tor .onion, and Regular Web Links */}
              <div className="glass-subtle rounded-xl divide-y divide-white/[0.07]">
                <div className="px-4 py-3 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-white flex items-center gap-2">
                    <Globe className="w-4 h-4 text-sky-400" />
                    <span>Direct Deep Web, Tor .onion &amp; Clear Web Finding Links</span>
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">Live Evidence Endpoints</span>
                </div>

                {/* 1. Direct Tor .onion v3 Hidden Service Link */}
                <div className="p-4 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-rose-300 flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-rose-400" />
                      <span>Direct Tor v3 Hidden Service Link (.onion)</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => copyWithFeedback(`onion-${selectedFinding.id}`, selectedFinding.torOnionUri)}
                        className="px-2.5 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-slate-200 font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {copiedKey === `onion-${selectedFinding.id}` ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Copied .onion</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy .onion URI</span>
                          </>
                        )}
                      </button>
                      <a
                        href={selectedFinding.torOnionUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-md bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 font-medium flex items-center gap-1 transition-colors whitespace-nowrap"
                      >
                        <span>Launch in Tor</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                  <p className="font-mono text-[11px] text-slate-400 break-all select-all">
                    {selectedFinding.torOnionUri}
                  </p>
                </div>

                {/* 2. Browser-Accessible Deep Web Search / Telemetry Link */}
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 space-y-0.5">
                    <span className="font-semibold text-sky-300 block">
                      Deep Web Relay / Unindexed Archive Link (Standard Browser)
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 truncate block">
                      {selectedFinding.deepWebUrl}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => copyWithFeedback(`deep-${selectedFinding.id}`, selectedFinding.deepWebUrl)}
                      className="px-2.5 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-slate-300 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      {copiedKey === `deep-${selectedFinding.id}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>Copy</span>
                    </button>
                    <a
                      href={selectedFinding.deepWebUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-md bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <span>Open Deep Web Link</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {/* 3. Regular Web Mirror & Official Removal Portal */}
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 space-y-0.5">
                    <span className="font-semibold text-emerald-300 block">
                      Regular Web Mirror &amp; Official Source Removal Portal
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 truncate block">
                      {selectedFinding.regularWebMirrorUrl}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={selectedFinding.regularWebMirrorUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-slate-200 font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <span>Inspect Clear Web</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href={selectedFinding.removalPortalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <span>Removal Portal</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>

              {/* Exposed Payload Snippet */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-slate-200">
                    Detected Selector Payload
                  </span>
                  <span className="text-slate-400">
                    Exposed: {selectedFinding.exposedAttributes.join(' · ')}
                  </span>
                </div>
                <div className="p-3.5 glass-subtle rounded-xl font-mono text-xs text-rose-300 break-all">
                  <code>{selectedFinding.sampleLeak}</code>
                </div>
              </div>

              {/* SECTION B: INTEGRATED STEP-BY-STEP MANUAL REMOVAL GUIDE FOR THIS SPECIFIC SOURCE */}
              <div className="pt-4 border-t border-white/[0.08] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-400" />
                      Step-by-Step Manual Removal Guide: {selectedFinding.sourceName}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Complete each source-specific action below to manually verify and permanently expunge this record.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-emerald-400 font-semibold shrink-0 tabular-nums">
                    {selectedStepsCompleted.length} of {totalStepsForSelected} Steps Completed ({stepProgressPct}%)
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${stepProgressPct}%` }}
                  />
                </div>

                {/* Interactive Source-Specific Steps */}
                <div className="space-y-3">
                  {selectedFinding.manualRemovalSteps.map((step) => {
                    const isDone = selectedStepsCompleted.includes(step.stepNumber);
                    return (
                      <div
                        key={step.stepNumber}
                        className={`p-4 rounded-xl transition-colors ${
                          isDone
                            ? 'bg-emerald-500/[0.08] border border-emerald-500/30'
                            : 'glass-subtle'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => toggleManualStep(selectedFinding.id, step.stepNumber)}
                            aria-label={`Mark step ${step.stepNumber} complete`}
                            className="mt-0.5 text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer shrink-0"
                          >
                            {isDone ? (
                              <CheckSquare className="w-5 h-5 text-emerald-400" />
                            ) : (
                              <Square className="w-5 h-5" />
                            )}
                          </button>

                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <h4
                                className={`text-sm font-bold ${
                                  isDone ? 'text-emerald-300 line-through' : 'text-white'
                                }`}
                              >
                                Step {step.stepNumber}. {step.title}
                              </h4>
                              <span className="text-[11px] font-mono text-slate-400 shrink-0">
                                Est. SLA: {step.estimatedSla}
                              </span>
                            </div>

                            <p className="text-xs text-slate-300 leading-relaxed">{step.instruction}</p>

                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                              <span className="text-[11px] text-slate-400">
                                Verification: {step.verificationNote}
                              </span>

                              {step.actionUrl && step.actionLabel && (
                                <a
                                  href={step.actionUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.09] text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors self-start sm:self-auto shrink-0 whitespace-nowrap"
                                >
                                  <span>{step.actionLabel}</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SECTION C: Source-Specific Pre-Filled Takedown Demand Letter */}
              <div className="pt-4 border-t border-white/[0.08] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-white">
                      Source-Specific Abuse &amp; Erasure Notice ({selectedFinding.hostContact})
                    </h4>
                    <p className="text-xs text-slate-400">
                      Pre-populated with exact deep web &amp; .onion selectors for {selectedFinding.sourceName}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copyWithFeedback('notice', sourceTakedownNotice)}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.09] text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {copiedKey === 'notice' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied Notice</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Notice</span>
                        </>
                      )}
                    </button>

                    <a
                      href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
                        selectedFinding.hostContact
                      )}&su=${encodeURIComponent(
                        `URGENT PII & Abuse Takedown Request - ${fullName}`
                      )}&body=${encodeURIComponent(sourceTakedownNotice)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <span>Open in Gmail Compose</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                <div className="p-4 glass-subtle rounded-xl font-mono text-xs text-slate-300 whitespace-pre-wrap max-h-52 overflow-y-auto leading-relaxed select-text">
                  {sourceTakedownNotice}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INTERACTIVE DIRECT DEEP WEB / DARK WEB LINK GENERATOR */}
      {activeTab === 'link-generator' && (
        <div className="p-6 sm:p-8 glass-panel rounded-2xl space-y-6">
          <div className="space-y-1.5">
            <h2 className="text-xl font-bold text-white">
              Direct Deep Web, Tor .onion &amp; Darknet Link Generator
            </h2>
            <p className="text-xs text-slate-400 max-w-3xl">
              Select any identifier from your profile or enter a custom search selector to generate direct query links across Tor v3 <code className="text-emerald-400 font-mono">.onion</code> search engines, darknet breach archives, infostealer radars, and deep paste repositories.
            </p>
          </div>

          {/* Quick Profile Selector Buttons */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-400 block">
              Quick-Select Profile Identifier:
            </span>
            <div className="flex flex-wrap gap-2">
              {presetSelectors.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setGeneratorQuery(preset.value);
                    setGeneratorType(preset.type);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    generatorQuery === preset.value
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                      : 'glass-subtle text-slate-300 hover:border-white/20'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Input Controls */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-8">
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Target Selector (Email, Full Name, Phone, Username, or Address)
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={generatorQuery}
                  onChange={(e) => setGeneratorQuery(e.target.value)}
                  placeholder="Enter email, phone, handle, or full name..."
                  className="w-full glass-input rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 font-mono"
                />
              </div>
            </div>

            <div className="md:col-span-4">
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Selector Type
              </label>
              <select
                value={generatorType}
                onChange={(e) => setGeneratorType(e.target.value as DirectLinkQueryType)}
                className="w-full glass-input rounded-xl px-3.5 py-2.5 text-sm text-white"
              >
                <option value="email">Email Address</option>
                <option value="name">Full Legal Name</option>
                <option value="phone">Phone Number</option>
                <option value="username">Username / Handle</option>
                <option value="address">Address / City + State</option>
              </select>
            </div>
          </div>

          {/* Generated Direct Links Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {generatedLinks.map((link) => (
              <div
                key={link.id}
                className="p-4 glass-card rounded-xl flex flex-col justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className={link.requiresTorBrowser ? 'text-rose-400 font-semibold' : 'text-sky-400 font-semibold'}>
                      {link.networkLayer}
                    </span>
                    <span className="text-slate-400">
                      {link.requiresTorBrowser ? 'Tor Browser Required' : 'Direct Web Gateway'}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white">{link.engineName}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{link.description}</p>
                  <p className="font-mono text-[11px] text-slate-400/90 break-all pt-1 select-all">
                    {link.directUrl}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.07]">
                  <button
                    onClick={() => copyWithFeedback(link.id, link.directUrl)}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-slate-300 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    {copiedKey === link.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy URL</span>
                      </>
                    )}
                  </button>

                  <a
                    href={link.directUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <span>{link.requiresTorBrowser ? 'Open .onion' : 'Launch Deep Link'}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: BATCH AUTOMATED TAKEDOWN */}
      {activeTab === 'automation' && (
        <div className="p-6 sm:p-8 glass-panel rounded-2xl space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-white">
              Automated Multi-Host Dark Web &amp; Paste Takedown Queue
            </h2>
            <p className="text-xs text-slate-400">
              Simultaneously transmits statutory CCPA, GDPR Art. 17, and anti-doxing erasure notices across all {findings.length} detected host compliance desks and logs audit confirmation tokens.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 glass-subtle rounded-xl divide-y md:divide-y-0 md:divide-x divide-white/[0.07]">
            <div className="p-4 space-y-1.5">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-emerald-400" /> Host Abuse Routing
              </span>
              <p className="text-xs text-slate-400 leading-relaxed">
                Routes formal erasure notices to paste repositories, archive indexers, and upstream proxy abuse desks.
              </p>
            </div>

            <div className="p-4 space-y-1.5">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-sky-400" /> Search Cache Purge
              </span>
              <p className="text-xs text-slate-400 leading-relaxed">
                Pairs automated host notices with Google &amp; Bing personal info de-indexing links for complete clearnet scrub.
              </p>
            </div>

            <div className="p-4 space-y-1.5">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-amber-400" /> Session &amp; Hash Hygiene
              </span>
              <p className="text-xs text-slate-400 leading-relaxed">
                Tracks credential rotation and session cookie invalidation across infostealer and combolist exposures.
              </p>
            </div>
          </div>

          <div className="p-5 glass-subtle rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-white">
                Execute Batch Takedown Across All {findings.length} Identified Sources
              </h3>
              <p className="text-xs text-slate-400">
                Recipients: {findings.map((f) => f.hostContact).join(' · ')}
              </p>
            </div>

            <button
              onClick={handleBatchTakedownDispatch}
              disabled={isDispatching}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-xs font-bold text-white transition-colors flex items-center gap-2 cursor-pointer shrink-0 whitespace-nowrap"
            >
              {isDispatching ? (
                <RotateCcw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>Dispatch All {findings.length} Takedowns</span>
            </button>
          </div>

          {dispatchSuccess && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{dispatchSuccess}</span>
            </div>
          )}
        </div>
      )}

      {dispatchError && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{dispatchError}</span>
          </div>
          {!isDirectSendConnected && onOpenConnectEmail && (
            <button
              type="button"
              onClick={onOpenConnectEmail}
              className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Connect Email Now</span>
            </button>
          )}
        </div>
      )}

      {pendingConfirmTargets && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
        >
          <div className="glass-popover rounded-2xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-white/[0.08]">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white">
                  {pendingConfirmTargets.length === 1
                    ? 'Confirm Sending Takedown Email'
                    : `Confirm Sending ${pendingConfirmTargets.length} Host Takedown Emails`}
                </h3>
                <p className="text-xs text-slate-400">
                  Sending directly from{' '}
                  <strong className="text-emerald-400 font-mono">{activeConnectedEmail}</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingConfirmTargets(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-44 overflow-y-auto glass-subtle rounded-xl divide-y divide-white/[0.07]">
              {pendingConfirmTargets.map((f) => (
                <div
                  key={f.id}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <span className="font-medium text-white truncate">{f.sourceName}</span>
                  <span className="text-emerald-400 font-mono truncate">{f.hostContact}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setPendingConfirmTargets(null)}
                className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmedDarkWebSend}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {pendingConfirmTargets.length === 1
                    ? 'Confirm & Send Email'
                    : `Confirm & Send ${pendingConfirmTargets.length} Emails`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
