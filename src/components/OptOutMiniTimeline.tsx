import React from 'react';
import { ScanResult } from '../types';
import {
  EXPECTED_REMOVAL_WINDOW_DAYS,
  calculateOptOutTimeline,
} from '../utils/optOutTimelineEngine';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Send,
  XCircle,
} from 'lucide-react';

interface OptOutMiniTimelineProps {
  brokerName: string;
  result: ScanResult;
  compact?: boolean;
  onFollowUp?: () => void;
}

const PROGRESS_WIDTH_CLASSES: ReadonlyArray<{ min: number; cls: string }> = [
  { min: 100, cls: 'w-full' },
  { min: 95, cls: 'w-[95%]' },
  { min: 90, cls: 'w-[90%]' },
  { min: 85, cls: 'w-[85%]' },
  { min: 80, cls: 'w-[80%]' },
  { min: 75, cls: 'w-3/4' },
  { min: 70, cls: 'w-[70%]' },
  { min: 65, cls: 'w-[65%]' },
  { min: 60, cls: 'w-3/5' },
  { min: 55, cls: 'w-[55%]' },
  { min: 50, cls: 'w-1/2' },
  { min: 45, cls: 'w-[45%]' },
  { min: 40, cls: 'w-2/5' },
  { min: 35, cls: 'w-[35%]' },
  { min: 30, cls: 'w-[30%]' },
  { min: 25, cls: 'w-1/4' },
  { min: 20, cls: 'w-1/5' },
  { min: 15, cls: 'w-[15%]' },
  { min: 10, cls: 'w-[10%]' },
  { min: 5, cls: 'w-[6%]' },
  { min: 0, cls: 'w-0' },
];

function resolveProgressWidthClass(percent: number): string {
  for (const entry of PROGRESS_WIDTH_CLASSES) {
    if (percent >= entry.min) return entry.cls;
  }
  return 'w-0';
}

export const OptOutMiniTimeline: React.FC<OptOutMiniTimelineProps> = ({
  brokerName,
  result,
  compact = false,
  onFollowUp,
}) => {
  const timeline = calculateOptOutTimeline(result);
  if (timeline.phase === 'not_submitted') return null;

  const isFailedOrCancelled =
    timeline.phase === 'failed' ||
    timeline.phase === 'rejected' ||
    timeline.phase === 'cancelled';
  const isUnavailable = timeline.phase === 'timestamp_unavailable';
  const isConfirmed = timeline.phase === 'confirmed_removed';
  const isPastOrReached =
    timeline.phase === 'past_expected_date' ||
    timeline.phase === 'expected_date_reached';

  const barColorClass = isConfirmed
    ? 'bg-emerald-400'
    : isPastOrReached
    ? 'bg-amber-400'
    : 'bg-sky-400';

  const statusTextColorClass = isConfirmed
    ? 'text-emerald-300'
    : isFailedOrCancelled
    ? 'text-rose-300'
    : isPastOrReached || isUnavailable
    ? 'text-amber-300'
    : 'text-sky-300';

  const StatusIcon = isConfirmed
    ? CheckCircle2
    : isFailedOrCancelled
    ? XCircle
    : timeline.phase === 'past_expected_date'
    ? AlertTriangle
    : timeline.phase === 'expected_date_reached'
    ? AlertCircle
    : isUnavailable
    ? HelpCircle
    : timeline.phase === 'submitted'
    ? Send
    : Clock;

  const progressBarAriaValueNow =
    timeline.elapsedCalendarDays !== null
      ? Math.min(EXPECTED_REMOVAL_WINDOW_DAYS, timeline.elapsedCalendarDays)
      : 0;

  if (compact) {
    return (
      <div
        role="region"
        aria-label={`45-day opt-out timeline for ${brokerName}`}
        className="mt-1.5 space-y-1 text-[11px] tabular-nums max-w-[230px]"
      >
        <div className={`inline-flex items-center gap-1 font-medium ${statusTextColorClass}`}>
          <StatusIcon className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>{timeline.statusHeadline}</span>
        </div>
        {!isFailedOrCancelled && !isUnavailable && (
          <div
            role="progressbar"
            aria-label={`${brokerName} 45-day estimated removal progress`}
            aria-valuemin={0}
            aria-valuemax={EXPECTED_REMOVAL_WINDOW_DAYS}
            aria-valuenow={isConfirmed ? EXPECTED_REMOVAL_WINDOW_DAYS : progressBarAriaValueNow}
            aria-valuetext={`${timeline.statusHeadline}. ${timeline.contextualSummary}`}
            className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden"
          >
            <div
              className={`h-full rounded-full ${barColorClass} ${resolveProgressWidthClass(
                timeline.progressPercent
              )}`}
            />
          </div>
        )}
        <p className="text-[10px] text-slate-400 leading-snug">
          {timeline.expectedRemovalDateFormatted && !isConfirmed
            ? `Est. ${timeline.expectedRemovalDateFormatted}${
                timeline.remainingCalendarDays !== null && timeline.remainingCalendarDays > 0
                  ? ` (${timeline.remainingCalendarDays}d left)`
                  : ''
              }`
            : timeline.contextualSummary}
        </p>
      </div>
    );
  }

  return (
    <section
      aria-label={`45-day opt-out request timeline for ${brokerName}`}
      className="pt-3 border-t border-white/[0.06] space-y-2.5 text-xs tabular-nums min-w-0"
    >
      {/* Status Headline + Submission Timestamp */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className={`inline-flex items-center gap-1.5 font-semibold ${statusTextColorClass}`}>
          <StatusIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{timeline.statusHeadline}</span>
        </span>
        {timeline.submittedDateFormatted && (
          <span className="text-[11px] text-slate-400">
            Sent {timeline.submittedDateFormatted}
          </span>
        )}
      </div>

      {/* Three-Stage Visual Progression: Submitted -> In Progress -> Expected Removal */}
      {!isFailedOrCancelled && !isUnavailable && (
        <div className="space-y-1.5">
          <div
            role="progressbar"
            aria-label={`${brokerName} 45-calendar-day estimated removal progress`}
            aria-valuemin={0}
            aria-valuemax={EXPECTED_REMOVAL_WINDOW_DAYS}
            aria-valuenow={isConfirmed ? EXPECTED_REMOVAL_WINDOW_DAYS : progressBarAriaValueNow}
            aria-valuetext={`${timeline.statusHeadline}. ${timeline.contextualSummary}`}
            className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden"
          >
            <div
              className={`h-full rounded-full ${barColorClass} ${resolveProgressWidthClass(
                timeline.progressPercent
              )}`}
            />
          </div>

          <ol
            aria-label="Opt-out request stages"
            className="grid grid-cols-3 gap-1 text-[10px] leading-tight"
          >
            <li
              className={
                timeline.activeStepIndex !== null && timeline.activeStepIndex >= 0
                  ? 'text-slate-200 font-medium truncate'
                  : 'text-slate-500 truncate'
              }
            >
              1. Submitted
            </li>
            <li
              className={`text-center truncate ${
                timeline.activeStepIndex === 1
                  ? isPastOrReached
                    ? 'text-amber-300 font-semibold'
                    : 'text-sky-300 font-semibold'
                  : isConfirmed
                  ? 'text-slate-300 font-medium'
                  : 'text-slate-500'
              }`}
            >
              2. In Progress
            </li>
            <li
              className={`text-right truncate ${
                isConfirmed
                  ? 'text-emerald-300 font-semibold'
                  : isPastOrReached
                  ? 'text-amber-300 font-medium'
                  : 'text-slate-400'
              }`}
            >
              {isConfirmed ? '3. Removed' : '3. Expected Removal'}
            </li>
          </ol>
        </div>
      )}

      {/* Contextual Dates & Remaining Time */}
      <p className="text-[11px] text-slate-300 leading-snug break-words">
        {timeline.contextualSummary}
      </p>

      {timeline.expectedRemovalDateFormatted && !isConfirmed && !isFailedOrCancelled && (
        <p className="text-[10px] text-slate-500 leading-snug">
          Expected removal date: {timeline.expectedRemovalDateFormatted} (45-calendar-day
          planning estimate — not proof of removal).
        </p>
      )}

      {/* Past Expected Date Guidance & Follow-Up Action */}
      {timeline.pastDueGuidance && (
        <div className="p-2.5 rounded-xl bg-amber-500/[0.07] border border-amber-400/20 space-y-2">
          <p className="text-[11px] text-amber-200 leading-relaxed">
            {timeline.pastDueGuidance}
          </p>
          {onFollowUp && (
            <button
              type="button"
              onClick={onFollowUp}
              className="px-2.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-[11px] cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              Follow Up With Broker
            </button>
          )}
        </div>
      )}
    </section>
  );
};
