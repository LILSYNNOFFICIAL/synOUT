import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DataBroker, ScanResult } from '../types';
import { copyTextToClipboard } from '../utils/exportEngines';
import {
  PrivacyTacticRecommendation,
  buildBrokerPrivacyTactics,
  formatPrivacyChecklistForClipboard,
  formatPrivacyTacticForClipboard,
} from '../utils/privacyTacticsEngine';
import {
  Check,
  Copy,
  ExternalLink,
  Info,
  Shield,
  ShieldCheck,
  X,
} from 'lucide-react';

interface PrivacyTacticsModalProps {
  broker: DataBroker;
  result?: ScanResult | null;
  effectiveOptOutUrlOverride?: string;
  returnFocusElement?: HTMLElement | null;
  onClose: () => void;
}

export const PrivacyTacticsModal: React.FC<PrivacyTacticsModalProps> = ({
  broker,
  result,
  effectiveOptOutUrlOverride,
  returnFocusElement,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const dossier = useMemo(
    () => buildBrokerPrivacyTactics(broker, result, effectiveOptOutUrlOverride),
    [broker, result, effectiveOptOutUrlOverride]
  );

  // Manage initial focus, Escape key, Tab focus trap, body scroll lock & focus restoration
  useEffect(() => {
    const previouslyFocused =
      returnFocusElement || (document.activeElement as HTMLElement | null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 10);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [onClose, returnFocusElement]);

  const handleCopyTactic = async (tactic: PrivacyTacticRecommendation) => {
    const text = formatPrivacyTacticForClipboard(dossier.brokerName, tactic);
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedId(tactic.id);
      window.setTimeout(() => {
        setCopiedId((prev) => (prev === tactic.id ? null : prev));
      }, 2200);
    }
  };

  const handleCopyChecklist = async () => {
    const text = formatPrivacyChecklistForClipboard(dossier);
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedId('full-checklist');
      window.setTimeout(() => {
        setCopiedId((prev) => (prev === 'full-checklist' ? null : prev));
      }, 2200);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-3 sm:p-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-tactics-modal-title"
        aria-describedby="privacy-tactics-modal-desc"
        className="w-full max-w-3xl max-h-[calc(100dvh-2rem)] sm:max-h-[88dvh] flex flex-col glass-popover rounded-2xl overflow-hidden text-slate-100"
      >
        {/* Modal Header */}
        <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-white/[0.08] flex items-start justify-between gap-4 shrink-0">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="text-emerald-400 font-semibold inline-flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Privacy Tactics</span>
              </span>
              <span aria-hidden="true">·</span>
              <span>{dossier.category}</span>
              <span aria-hidden="true">·</span>
              <span>Opt-Out Status: {dossier.optOutStatusLabel}</span>
            </div>

            <h2
              id="privacy-tactics-modal-title"
              className="text-xl sm:text-2xl font-bold text-white tracking-tight break-words"
            >
              {dossier.brokerName} Privacy Tactics
            </h2>

            <p
              id="privacy-tactics-modal-desc"
              className="text-xs text-slate-300 leading-relaxed"
            >
              {dossier.riskSummary}
            </p>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={`Close ${dossier.brokerName} Privacy Tactics modal`}
            className="p-2 rounded-xl glass-subtle hover:bg-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Advice Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5 space-y-5">
          {/* Documented Process vs General Guidance Summary */}
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-1.5 text-xs">
            <div className="flex items-center gap-2 font-semibold text-white">
              {dossier.hasVerifiedBrokerDocumentation ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                  <span>Documented {dossier.brokerName} Opt-Out Profile</span>
                </>
              ) : (
                <>
                  <Info className="w-4 h-4 text-amber-300 shrink-0" aria-hidden="true" />
                  <span>Unverified Broker Profile — General Privacy Guidance</span>
                </>
              )}
            </div>
            <p className="text-slate-300 leading-relaxed">{dossier.documentedChannelSummary}</p>
            <p className="text-[11px] text-slate-400">
              Opening this guide does not submit forms or send personal information to{' '}
              {dossier.brokerName}. Review these tactics to decide what information to share.
            </p>
          </div>

          {/* Actionable Privacy Tactics (Categories A–G) */}
          <div className="divide-y divide-white/[0.07]">
            {dossier.recommendations.map((tactic) => {
              const isCopied = copiedId === tactic.id;
              return (
                <article key={tactic.id} className="py-4 first:pt-1 last:pb-1 space-y-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        <span className="font-semibold text-emerald-300">
                          {tactic.categoryLabel}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            tactic.evidenceBasis === 'verified_broker_doc'
                              ? 'text-sky-300'
                              : 'text-slate-400'
                          }
                        >
                          {tactic.evidenceBasis === 'verified_broker_doc'
                            ? 'Broker-Specific Guidance'
                            : 'General Privacy Guidance'}
                        </span>
                      </div>
                      <h3 className="text-sm sm:text-base font-semibold text-white">
                        {tactic.title}
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleCopyTactic(tactic)}
                      className="px-2.5 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.08] text-slate-300 hover:text-white text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Copy Recommendation</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="space-y-1.5 text-xs leading-relaxed">
                    <p className="text-slate-300">
                      <strong className="text-slate-200 font-semibold">Privacy Risk: </strong>
                      {tactic.riskExplanation}
                    </p>
                    <p className="text-slate-200">
                      <strong className="text-emerald-300 font-semibold">Recommended Action: </strong>
                      {tactic.recommendedAction}
                    </p>
                    <p className="text-slate-400">
                      <strong className="text-slate-300 font-medium">Condition &amp; Boundary: </strong>
                      {tactic.limitationOrCondition}
                    </p>
                  </div>

                  {/* Evidence & Source Reference */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px] text-slate-400">
                    <span>{tactic.sourceLabel}</span>
                    {tactic.sourceUrl && (
                      <a
                        href={tactic.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-300 hover:text-sky-200 underline underline-offset-2 inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded"
                      >
                        <span>Official Opt-Out Page (external site)</span>
                        <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="px-5 py-3.5 sm:px-6 sm:py-4 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3 shrink-0 bg-slate-950/50">
          <div className="flex flex-wrap items-center gap-2">
            {dossier.officialOptOutUrl && (
              <a
                href={dossier.officialOptOutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-xl glass-subtle hover:bg-white/[0.08] text-sky-300 hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <span>Open Official Opt-Out Instructions (External)</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              </a>
            )}

            <button
              type="button"
              onClick={() => void handleCopyChecklist()}
              className="px-3.5 py-2 rounded-xl glass-subtle hover:bg-white/[0.08] text-slate-200 hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              {copiedId === 'full-checklist' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  <span>Checklist Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  <span>Copy Privacy Checklist</span>
                </>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            Return to ExposureReport
          </button>
        </div>
      </div>
    </div>
  );
};
