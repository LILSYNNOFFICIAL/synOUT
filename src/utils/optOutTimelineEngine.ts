import { ScanResult } from '../types';
import { hasVerifiedEmailReceipt } from '../services/emailConnectionStore';
import { hasWebFormSubmission } from './optOutFormEngine';

export const EXPECTED_REMOVAL_WINDOW_DAYS = 45;
const MS_PER_UTC_DAY = 24 * 60 * 60 * 1000;

export type OptOutTimelinePhase =
  | 'not_submitted'
  | 'submitted'
  | 'in_progress'
  | 'expected_date_reached'
  | 'past_expected_date'
  | 'confirmed_removed'
  | 'failed'
  | 'rejected'
  | 'cancelled'
  | 'timestamp_unavailable';

export interface OptOutTimelineComputation {
  phase: OptOutTimelinePhase;
  submittedAtIso: string | null;
  submittedDateFormatted: string | null;
  expectedRemovalIso: string | null;
  expectedRemovalDateFormatted: string | null;
  verifiedRemovedDateFormatted: string | null;
  elapsedCalendarDays: number | null;
  remainingCalendarDays: number | null;
  progressPercent: number;
  activeStepIndex: 0 | 1 | 2 | null;
  statusHeadline: string;
  contextualSummary: string;
  pastDueGuidance: string | null;
  isActionableFollowUp: boolean;
}

function parseValidDateTimestamp(raw?: string | null): Date | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Reject bare numeric strings like "123" that Date.parse might misinterpret as year 0123
  if (/^\d{1,5}$/.test(trimmed)) return null;

  const parsedMs = Date.parse(trimmed);
  if (Number.isNaN(parsedMs)) return null;

  const dt = new Date(parsedMs);
  const year = dt.getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  return dt;
}

function toUtcDayStartMs(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Adds an exact number of calendar days in UTC so month boundaries, year boundaries,
 * leap years (Feb 29), and daylight-saving transitions never drift.
 */
export function addCalendarDaysUtc(submittedDate: Date, calendarDays: number): Date {
  return new Date(
    Date.UTC(
      submittedDate.getUTCFullYear(),
      submittedDate.getUTCMonth(),
      submittedDate.getUTCDate() + calendarDays,
      submittedDate.getUTCHours(),
      submittedDate.getUTCMinutes(),
      submittedDate.getUTCSeconds(),
      submittedDate.getUTCMilliseconds()
    )
  );
}

export function formatCalendarDateUtc(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Determines whether a ScanResult represents an opt-out request card that should
 * display the 45-day mini-timeline inside ExposureReport.
 */
export function shouldRenderOptOutTimeline(result: ScanResult): boolean {
  if (
    result.removalStatus === 'submitted' ||
    result.removalStatus === 'removed' ||
    result.removalStatus === 'failed'
  ) {
    return true;
  }

  if (
    result.workflowState === 'failed' ||
    result.workflowState === 'rejected' ||
    result.workflowState === 'cancelled' ||
    result.workflowState === 'removal_verified' ||
    result.workflowState === 'submitted_unconfirmed' ||
    result.workflowState === 'awaiting_email_verification' ||
    result.workflowState === 'awaiting_broker_processing'
  ) {
    return true;
  }

  return hasVerifiedEmailReceipt(result) || hasWebFormSubmission(result);
}

/**
 * Deterministically computes the 45-calendar-day mini-timeline state from the
 * original recorded submission timestamp on ScanResult.
 * Never resets dates on refresh and never marks a request removed merely because
 * 45 days have elapsed.
 */
export function calculateOptOutTimeline(
  result: ScanResult,
  referenceNow: Date | number = new Date()
): OptOutTimelineComputation {
  const nowDate =
    referenceNow instanceof Date ? referenceNow : new Date(referenceNow);

  // Resolve original earliest recorded submission timestamp without inventing one
  const primaryIsoCandidate = result.submittedAtIso || result.webFormSubmittedAtIso || null;
  const submittedDate =
    parseValidDateTimestamp(primaryIsoCandidate) ||
    parseValidDateTimestamp(result.submissionDate);

  const verifiedDate = parseValidDateTimestamp(result.verifiedRemovedAtIso);

  const submittedAtIso = submittedDate ? submittedDate.toISOString() : null;
  const submittedDateFormatted = submittedDate ? formatCalendarDateUtc(submittedDate) : null;

  const expectedDate = submittedDate
    ? addCalendarDaysUtc(submittedDate, EXPECTED_REMOVAL_WINDOW_DAYS)
    : null;
  const expectedRemovalIso = expectedDate ? expectedDate.toISOString() : null;
  const expectedRemovalDateFormatted = expectedDate
    ? formatCalendarDateUtc(expectedDate)
    : null;
  const verifiedRemovedDateFormatted = verifiedDate
    ? formatCalendarDateUtc(verifiedDate)
    : null;

  // 1. Failed / Rejected / Cancelled states take priority over progress bars
  if (result.workflowState === 'cancelled') {
    return {
      phase: 'cancelled',
      submittedAtIso,
      submittedDateFormatted,
      expectedRemovalIso: null,
      expectedRemovalDateFormatted: null,
      verifiedRemovedDateFormatted: null,
      elapsedCalendarDays: null,
      remainingCalendarDays: null,
      progressPercent: 0,
      activeStepIndex: null,
      statusHeadline: 'Opt-Out Request Cancelled',
      contextualSummary:
        'This opt-out workflow was cancelled before broker processing completed. Submit a new request if removal is still needed.',
      pastDueGuidance: null,
      isActionableFollowUp: false,
    };
  }

  if (result.workflowState === 'rejected') {
    return {
      phase: 'rejected',
      submittedAtIso,
      submittedDateFormatted,
      expectedRemovalIso: null,
      expectedRemovalDateFormatted: null,
      verifiedRemovedDateFormatted: null,
      elapsedCalendarDays: null,
      remainingCalendarDays: null,
      progressPercent: 0,
      activeStepIndex: null,
      statusHeadline: 'Request Rejected by Broker',
      contextualSummary:
        'The broker rejected or refused this request. Review reply triage details or verify required record identifiers before re-submitting.',
      pastDueGuidance: null,
      isActionableFollowUp: true,
    };
  }

  if (result.removalStatus === 'failed' || result.workflowState === 'failed') {
    return {
      phase: 'failed',
      submittedAtIso,
      submittedDateFormatted,
      expectedRemovalIso: null,
      expectedRemovalDateFormatted: null,
      verifiedRemovedDateFormatted: null,
      elapsedCalendarDays: null,
      remainingCalendarDays: null,
      progressPercent: 0,
      activeStepIndex: null,
      statusHeadline: 'Submission Failed',
      contextualSummary:
        'The opt-out submission could not be completed. Retry via Online Form or Legal Email.',
      pastDueGuidance: null,
      isActionableFollowUp: true,
    };
  }

  // 2. Confirmed Removed (ONLY when genuinely confirmed/verified — never inferred by date!)
  const isConfirmedRemoved =
    result.removalStatus === 'removed' ||
    result.workflowState === 'removal_verified' ||
    Boolean(verifiedDate);

  if (isConfirmedRemoved) {
    const elapsed =
      submittedDate && verifiedDate
        ? Math.max(
            0,
            Math.round(
              (toUtcDayStartMs(verifiedDate) - toUtcDayStartMs(submittedDate)) / MS_PER_UTC_DAY
            )
          )
        : submittedDate
        ? Math.max(
            0,
            Math.round(
              (toUtcDayStartMs(nowDate) - toUtcDayStartMs(submittedDate)) / MS_PER_UTC_DAY
            )
          )
        : null;

    return {
      phase: 'confirmed_removed',
      submittedAtIso,
      submittedDateFormatted,
      expectedRemovalIso,
      expectedRemovalDateFormatted,
      verifiedRemovedDateFormatted,
      elapsedCalendarDays: elapsed,
      remainingCalendarDays: 0,
      progressPercent: 100,
      activeStepIndex: 2,
      statusHeadline: 'Confirmed Removed',
      contextualSummary: verifiedRemovedDateFormatted
        ? `Removal confirmed on ${verifiedRemovedDateFormatted}${submittedDateFormatted ? ` (submitted ${submittedDateFormatted})` : ''}.`
        : 'Removal status confirmed.',
      pastDueGuidance: null,
      isActionableFollowUp: false,
    };
  }

  // 3. Not yet submitted
  if (!shouldRenderOptOutTimeline(result)) {
    return {
      phase: 'not_submitted',
      submittedAtIso: null,
      submittedDateFormatted: null,
      expectedRemovalIso: null,
      expectedRemovalDateFormatted: null,
      verifiedRemovedDateFormatted: null,
      elapsedCalendarDays: null,
      remainingCalendarDays: null,
      progressPercent: 0,
      activeStepIndex: null,
      statusHeadline: 'Pending Submission',
      contextualSummary: 'Opt-out request has not been submitted yet.',
      pastDueGuidance: null,
      isActionableFollowUp: false,
    };
  }

  // 4. Submitted/In-Progress, yet timestamp is missing or invalid -> explicit unavailable state
  if (!submittedDate || !expectedDate) {
    return {
      phase: 'timestamp_unavailable',
      submittedAtIso: null,
      submittedDateFormatted: null,
      expectedRemovalIso: null,
      expectedRemovalDateFormatted: null,
      verifiedRemovedDateFormatted: null,
      elapsedCalendarDays: null,
      remainingCalendarDays: null,
      progressPercent: 0,
      activeStepIndex: 0,
      statusHeadline: 'Submitted · Date Unavailable',
      contextualSummary:
        'Original submission timestamp is unavailable; expected 45-day removal date cannot be calculated.',
      pastDueGuidance: null,
      isActionableFollowUp: false,
    };
  }

  // 5. Valid submission timestamp -> exact UTC calendar day comparison
  const submittedDayMs = toUtcDayStartMs(submittedDate);
  const expectedDayMs = toUtcDayStartMs(expectedDate);
  const nowDayMs = toUtcDayStartMs(nowDate);

  const rawElapsedDays = Math.round((nowDayMs - submittedDayMs) / MS_PER_UTC_DAY);
  const elapsedCalendarDays = Math.max(0, rawElapsedDays);
  const remainingCalendarDays = Math.round((expectedDayMs - nowDayMs) / MS_PER_UTC_DAY);

  const submittedAgoText =
    elapsedCalendarDays === 0
      ? 'Submitted today'
      : elapsedCalendarDays === 1
      ? 'Submitted 1 day ago'
      : `Submitted ${elapsedCalendarDays} days ago`;

  const awaitingEmailConfirmNote =
    result.workflowState === 'awaiting_email_verification'
      ? ' · Check inbox for confirmation link'
      : '';

  // 5a. Expected date reached today (unconfirmed)
  if (remainingCalendarDays === 0) {
    return {
      phase: 'expected_date_reached',
      submittedAtIso,
      submittedDateFormatted,
      expectedRemovalIso,
      expectedRemovalDateFormatted,
      verifiedRemovedDateFormatted: null,
      elapsedCalendarDays,
      remainingCalendarDays: 0,
      progressPercent: 100,
      activeStepIndex: 1,
      statusHeadline: 'Expected Date Reached · Unconfirmed',
      contextualSummary: `Expected date reached (${expectedRemovalDateFormatted}). Removal has not yet been confirmed—check the broker listing to verify.`,
      pastDueGuidance: null,
      isActionableFollowUp: true,
    };
  }

  // 5b. Past expected 45-day date (unconfirmed — NEVER auto-completed!)
  if (remainingCalendarDays < 0) {
    const daysPast = Math.abs(remainingCalendarDays);
    return {
      phase: 'past_expected_date',
      submittedAtIso,
      submittedDateFormatted,
      expectedRemovalIso,
      expectedRemovalDateFormatted,
      verifiedRemovedDateFormatted: null,
      elapsedCalendarDays,
      remainingCalendarDays,
      progressPercent: 100,
      activeStepIndex: 1,
      statusHeadline: `Past Expected Date (${daysPast}d Over Estimate)`,
      contextualSummary: `${submittedAgoText} · Expected removal date was ${expectedRemovalDateFormatted} (unconfirmed).`,
      pastDueGuidance:
        'The expected removal date has passed. The broker may still be processing your request. Review the request status and consider following up with the broker.',
      isActionableFollowUp: true,
    };
  }

  // 5c. Newly submitted (Day 0) vs In Progress (Days 1..44)
  const isNewlySubmitted = elapsedCalendarDays === 0;
  const rawPct = Math.round((elapsedCalendarDays / EXPECTED_REMOVAL_WINDOW_DAYS) * 100);
  const progressPercent = isNewlySubmitted ? 6 : Math.min(96, Math.max(8, rawPct));
  const remainingText =
    remainingCalendarDays === 1
      ? 'Approximately 1 day remaining'
      : `Approximately ${remainingCalendarDays} days remaining`;

  return {
    phase: isNewlySubmitted ? 'submitted' : 'in_progress',
    submittedAtIso,
    submittedDateFormatted,
    expectedRemovalIso,
    expectedRemovalDateFormatted,
    verifiedRemovedDateFormatted: null,
    elapsedCalendarDays,
    remainingCalendarDays,
    progressPercent,
    activeStepIndex: isNewlySubmitted ? 0 : 1,
    statusHeadline: isNewlySubmitted
      ? `Submitted${awaitingEmailConfirmNote}`
      : `In Progress · Est. 45-Day Window${awaitingEmailConfirmNote}`,
    contextualSummary: `${submittedAgoText} · ${remainingText} · Est. removal: ${expectedRemovalDateFormatted}`,
    pastDueGuidance: null,
    isActionableFollowUp: false,
  };
}
