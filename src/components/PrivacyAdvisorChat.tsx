import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScanResult, ScanStats, UserProfile } from '../types';
import { copyTextToClipboard } from '../utils/exportEngines';
import {
  AdvisorChatMessage,
  AdvisorRoleId,
  AdvisorSpeedMode,
  buildScanContextSummary,
  clearAdvisorThreadHistory,
  loadAdvisorThreadHistory,
  saveAdvisorThreadHistory,
  sendPrivacyAdvisorMessageClient,
} from '../services/privacyAdvisorClient';
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  MessageSquare,
  RotateCcw,
  Scale,
  Send,
  ShieldAlert,
  X,
  Zap,
} from 'lucide-react';

interface PrivacyAdvisorChatProps {
  profile: UserProfile | null;
  results: ScanResult[];
  stats: ScanStats;
  mode?: 'page' | 'drawer';
  onClose?: () => void;
  initialPrompt?: string | null;
  onConsumeInitialPrompt?: () => void;
}

const ROLE_OPTIONS: Array<{
  id: AdvisorRoleId;
  label: string;
  subtitle: string;
}> = [
  {
    id: 'statutory_counsel',
    label: 'Statutory Counsel',
    subtitle: 'CCPA, Delete Act, TDPSA & 11 CCR § 7060 consumer rights',
  },
  {
    id: 'broker_researcher',
    label: 'Broker Web Researcher',
    subtitle: 'Live opt-out portals, parent clearinghouses & regulator updates',
  },
  {
    id: 'rapid_triage',
    label: 'Rapid Triage',
    subtitle: 'Prioritized step-by-step removal sequence for exposed brokers',
  },
];

export const PrivacyAdvisorChat: React.FC<PrivacyAdvisorChatProps> = ({
  profile,
  results,
  stats,
  mode = 'page',
  onClose,
  initialPrompt,
  onConsumeInitialPrompt,
}) => {
  const [messages, setMessages] = useState<AdvisorChatMessage[]>(() =>
    loadAdvisorThreadHistory()
  );
  const [inputText, setInputText] = useState('');
  const [roleId, setRoleId] = useState<AdvisorRoleId>('statutory_counsel');
  const [speedMode, setSpeedMode] = useState<AdvisorSpeedMode>('grounded_standard');
  const [useSearchGrounding, setUseSearchGrounding] = useState<boolean>(true);
  const [isSending, setIsSending] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const scanContext = useMemo(
    () => buildScanContextSummary(profile, results, stats),
    [profile, results, stats]
  );

  useEffect(() => {
    saveAdvisorThreadHistory(messages);
  }, [messages]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isSending]);

  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      setInputText(initialPrompt.trim());
      onConsumeInitialPrompt?.();
    }
  }, [initialPrompt, onConsumeInitialPrompt]);

  const suggestedPrompts = useMemo(() => {
    const topBroker = scanContext.topExposedBrokers?.[0]?.name || 'Spokeo and Whitepages';
    const stateLabel = profile?.currentState || 'CA';
    return [
      `Verify current opt-out procedures and parent network details for ${topBroker}.`,
      `What privacy deletion statutes apply to a resident in ${stateLabel}, and what is the 45-day SLA rule?`,
      `A data broker demanded an unredacted Driver's License photo to process my opt-out. How do I counter under 11 CCR § 7060?`,
      `Prioritize my ${stats.exposedBrokers || 'exposed'} broker listings by highest doxxing and identity-theft risk.`,
    ];
  }, [scanContext.topExposedBrokers, profile?.currentState, stats.exposedBrokers]);

  const handleSelectSpeedMode = (nextMode: AdvisorSpeedMode) => {
    setSpeedMode(nextMode);
    if (nextMode === 'fast_lite') {
      setUseSearchGrounding(false);
    } else {
      setUseSearchGrounding(true);
    }
  };

  const handleToggleSearch = () => {
    setUseSearchGrounding((prev) => {
      const next = !prev;
      if (next && speedMode === 'fast_lite') {
        setSpeedMode('grounded_standard');
      }
      return next;
    });
  };

  const handleSendMessage = async (overridePrompt?: string) => {
    const textToSend = (overridePrompt ?? inputText).trim();
    if (!textToSend || isSending) return;

    setErrorBanner(null);
    if (!overridePrompt) {
      setInputText('');
    }

    const userTurn: AdvisorChatMessage = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      text: textToSend,
      timestampIso: new Date().toISOString(),
    };

    const priorHistory = messages.map((m) => ({
      role: m.role,
      text: m.text,
    }));

    setMessages((prev) => [...prev, userTurn]);
    setIsSending(true);

    try {
      const response = await sendPrivacyAdvisorMessageClient({
        message: textToSend,
        history: priorHistory,
        roleId,
        speedMode,
        useSearchGrounding,
        scanContext: results.length > 0 ? scanContext : undefined,
      });

      const assistantTurn: AdvisorChatMessage = {
        id: `mdl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'model',
        text: response.replyText,
        timestampIso: response.timestampIso,
        citations: response.citations,
        searchQueries: response.searchQueries,
        modelUsed: response.modelUsed,
        roleId: response.roleId,
        groundedWithSearch: response.groundedWithSearch,
      };

      setMessages((prev) => [...prev, assistantTurn]);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to complete Privacy Advisor request right now.';
      setErrorBanner(msg);
    } finally {
      setIsSending(false);
    }
  };

  const handleClearThread = () => {
    clearAdvisorThreadHistory();
    setMessages([]);
    setErrorBanner(null);
  };

  const handleCopyMessage = async (msg: AdvisorChatMessage) => {
    const citationFooter =
      msg.citations && msg.citations.length > 0
        ? `\n\nSources:\n${msg.citations.map((c) => `- ${c.title}: ${c.uri}`).join('\n')}`
        : '';
    const ok = await copyTextToClipboard(`${msg.text}${citationFooter}`);
    if (ok) {
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId((prev) => (prev === msg.id ? null : prev)), 2000);
    }
  };

  const containerShellClass =
    mode === 'drawer'
      ? 'fixed inset-y-0 right-0 z-50 w-full max-w-xl glass-popover border-l border-white/[0.1] flex flex-col shadow-2xl'
      : 'max-w-5xl mx-auto py-8 px-4';

  const innerPanelClass =
    mode === 'drawer'
      ? 'flex-1 flex flex-col min-h-0 p-5 gap-4'
      : 'glass-panel rounded-2xl p-6 sm:p-8 flex flex-col min-h-[680px] max-h-[82vh] gap-5';

  const activeRoleMeta =
    ROLE_OPTIONS.find((r) => r.id === roleId) || ROLE_OPTIONS[0];

  return (
    <div className={containerShellClass}>
      <div className={innerPanelClass}>
        {/* Header & Controls */}
        <div className="space-y-3 border-b border-white/[0.08] pb-4 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
                <span className="font-medium text-emerald-400 inline-flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5" /> Privacy &amp; Opt-Out Advisor
                </span>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span>Multi-Turn Counsel</span>
                {results.length > 0 && (
                  <>
                    <span className="text-slate-600" aria-hidden="true">·</span>
                    <span>
                      Linked Dossier: {stats.exposedBrokers} Exposed ({stats.exposureScore}/100)
                    </span>
                  </>
                )}
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Statutory Opt-Out &amp; Live Broker Research Thread
              </h1>
              <p className="text-xs text-slate-400">{activeRoleMeta.subtitle}</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearThread}
                  className="px-3 py-1.5 rounded-xl glass-subtle text-slate-300 hover:text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear Thread</span>
                </button>
              )}
              {mode === 'drawer' && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close Privacy Advisor drawer"
                  className="p-2 rounded-xl glass-subtle text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Role & Grounding Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs">
            {/* Role Selector */}
            <div className="flex flex-wrap items-center p-1 glass-subtle rounded-xl gap-1">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRoleId(opt.id)}
                  className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    roleId === opt.id
                      ? 'bg-white/[0.1] text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Speed & Google Search Grounding Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center p-1 glass-subtle rounded-xl">
                <button
                  type="button"
                  onClick={() => handleSelectSpeedMode('grounded_standard')}
                  className={`px-2.5 py-1.5 rounded-lg font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    speedMode === 'grounded_standard'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Deep privacy research with live Google Search web grounding"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Grounded Research</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectSpeedMode('fast_lite')}
                  className={`px-2.5 py-1.5 rounded-lg font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    speedMode === 'fast_lite'
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Low-latency rapid privacy triage"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Fast Triage</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleToggleSearch}
                aria-pressed={useSearchGrounding}
                className={`px-3 py-1.5 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  useSearchGrounding
                    ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300'
                    : 'glass-subtle border-white/[0.08] text-slate-400 hover:text-white'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Google Search: {useSearchGrounding ? 'On' : 'Off'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Multi-Turn Conversation Thread */}
        <div
          role="log"
          aria-live="polite"
          className="flex-1 overflow-y-auto pr-1 space-y-4 min-h-[260px]"
        >
          {messages.length === 0 ? (
            <div className="py-6 space-y-5">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  <span>Ask about any data broker, opt-out form, or state privacy statute</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                  Conversation history stays active across follow-up questions in this thread. When{' '}
                  <strong className="text-slate-200">Google Search</strong> is enabled, responses verify
                  current opt-out portals and regulatory guidance with clickable web citations.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {suggestedPrompts.map((promptText, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => void handleSendMessage(promptText)}
                    disabled={isSending}
                    className="p-3.5 rounded-xl glass-card text-left text-xs text-slate-200 hover:text-white hover:border-emerald-400/35 transition-colors cursor-pointer leading-relaxed"
                  >
                    {promptText}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[90%] sm:max-w-[82%] rounded-2xl px-4 py-3.5 text-xs space-y-2.5 ${
                      isUser
                        ? 'bg-emerald-500/15 border border-emerald-400/30 text-white'
                        : 'glass-card text-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 text-[11px] text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-200">
                          {isUser
                            ? 'You'
                            : ROLE_OPTIONS.find((r) => r.id === msg.roleId)?.label ||
                              'Privacy Advisor'}
                        </span>
                        {!isUser && msg.groundedWithSearch && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-300">Search Grounded</span>
                          </>
                        )}
                        {!isUser && msg.modelUsed === 'gemini-3.1-flash-lite' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-sky-300">Fast Mode</span>
                          </>
                        )}
                      </div>

                      {!isUser && (
                        <button
                          type="button"
                          onClick={() => void handleCopyMessage(msg)}
                          className="text-slate-400 hover:text-white inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          title="Copy response"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    <div className="whitespace-pre-wrap leading-relaxed text-[13px] text-slate-100">
                      {msg.text}
                    </div>

                    {/* Grounding Web Source Citations */}
                    {!isUser && msg.citations && msg.citations.length > 0 && (
                      <div className="pt-2.5 border-t border-white/[0.08] space-y-1.5">
                        <div className="text-[11px] font-medium text-slate-400">
                          Verified Web Sources ({msg.citations.length})
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {msg.citations.map((cite, cIdx) => (
                            <a
                              key={`${cite.uri}-${cIdx}`}
                              href={cite.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-[11px] text-sky-300 hover:text-sky-200 inline-flex items-center gap-1.5 max-w-[260px] transition-colors"
                            >
                              <Globe className="w-3 h-3 shrink-0 text-emerald-400" />
                              <span className="truncate">{cite.title}</span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-75" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {isSending && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-3 glass-card text-xs text-slate-300">
                {useSearchGrounding
                  ? 'Searching live web sources and preparing privacy guidance...'
                  : 'Preparing rapid triage response...'}
              </div>
            </div>
          )}

          <div ref={threadEndRef} />
        </div>

        {/* Error Banner */}
        {errorBanner && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2 text-xs text-rose-200 shrink-0">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorBanner}</span>
          </div>
        )}

        {/* Composer Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSendMessage();
          }}
          className="pt-2 border-t border-white/[0.08] flex items-end gap-2.5 shrink-0"
        >
          <textarea
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSendMessage();
              }
            }}
            placeholder="Ask a follow-up about broker opt-out steps, statutory deadlines, or ID refusal rules..."
            className="flex-1 glass-input rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 resize-none"
          />
          <button
            type="submit"
            disabled={isSending || !inputText.trim()}
            className="px-4 py-3 rounded-xl bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSending ? 'Sending...' : 'Send'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
