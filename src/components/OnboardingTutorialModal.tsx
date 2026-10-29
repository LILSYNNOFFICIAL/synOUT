import React, { useEffect } from 'react';
import { GMAIL_SCOPES } from '../services/googleAuth';
import {
  TOTAL_TUTORIAL_STEPS,
  closeOnboardingTutorial,
  completeOnboardingTutorial,
  setOnboardingStep,
  skipOnboardingTutorial,
  useOnboardingTutorial,
} from '../utils/onboardingStore';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Lock,
  Mail,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';

interface OnboardingTutorialModalProps {
  onConnectEmailAndStart: () => void;
  onExploreIndependently: () => void;
}

const STEP_WIDTH_CLASSES: ReadonlyArray<string> = [
  'w-[12.5%]',
  'w-1/4',
  'w-[37.5%]',
  'w-1/2',
  'w-[62.5%]',
  'w-3/4',
  'w-[87.5%]',
  'w-full',
];

export const OnboardingTutorialModal: React.FC<OnboardingTutorialModalProps> = ({
  onConnectEmailAndStart,
  onExploreIndependently,
}) => {
  const onboarding = useOnboardingTutorial();
  const step = onboarding.currentStep;

  useEffect(() => {
    if (!onboarding.isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeOnboardingTutorial();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onboarding.isOpen]);

  if (!onboarding.isOpen) return null;

  const isFirstStep = step === 0;
  const isFinalStep = step === TOTAL_TUTORIAL_STEPS - 1;
  const progressClass = STEP_WIDTH_CLASSES[step] || 'w-[12.5%]';

  return (
    <div
      data-testid="synout-onboarding-tutorial"
      className="fixed inset-x-0 bottom-0 sm:inset-auto sm:bottom-5 sm:right-5 z-40 pointer-events-none p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-0"
    >
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby="synout-tutorial-title"
        aria-describedby="synout-tutorial-body"
        className="pointer-events-auto w-full sm:w-[470px] max-h-[calc(100dvh-5.5rem)] flex flex-col glass-popover rounded-2xl overflow-hidden text-slate-100"
      >
        {/* Top Header & Progress Indicator */}
        <div className="px-4 py-3.5 sm:px-5 border-b border-white/[0.08] space-y-2.5 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-300 tabular-nums min-w-0">
              <span className="font-bold text-white tracking-tight">synOUT Guide</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-emerald-300 font-medium">
                Step {step + 1} of {TOTAL_TUTORIAL_STEPS}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isFinalStep && (
                <button
                  type="button"
                  onClick={skipOnboardingTutorial}
                  className="px-2.5 py-1 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  Skip Tutorial
                </button>
              )}
              <button
                type="button"
                onClick={closeOnboardingTutorial}
                aria-label="Close onboarding tutorial"
                className="p-1.5 rounded-lg glass-subtle hover:bg-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div
            role="progressbar"
            aria-label="Onboarding tutorial progress"
            aria-valuemin={1}
            aria-valuemax={TOTAL_TUTORIAL_STEPS}
            aria-valuenow={step + 1}
            className="w-full h-1 rounded-full bg-white/[0.08] overflow-hidden"
          >
            <div className={`h-full rounded-full bg-emerald-400 transition-all ${progressClass}`} />
          </div>
        </div>

        {/* Scrollable Step Content + Labeled Visual Preview */}
        <div id="synout-tutorial-body" className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 space-y-3.5 text-xs">
          {step === 0 && (
            <>
              <h2
                id="synout-tutorial-title"
                className="text-lg sm:text-xl font-bold text-white tracking-tight"
              >
                Take control of your digital privacy.
              </h2>
              <p className="text-slate-300 leading-relaxed">
                <strong>synOUT</strong> helps you check where public people-search and marketing
                data brokers may list your personal details, understand broker-specific privacy
                risks, and organize opt-out requests via online forms and email.
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                While synOUT streamlines opt-out requests and tracking, external brokers control
                their own databases—no tool can guarantee complete removal from the internet.
              </p>

              {/* Illustrative Visual Example */}
              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                <div className="text-[10px] text-slate-400">
                  Illustrative Workflow Preview (Sample Data)
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg glass-subtle space-y-1">
                    <Search className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                    <div className="font-semibold text-white">1. Discover</div>
                    <div className="text-[10px] text-slate-400">Audit broker exposure</div>
                  </div>
                  <div className="p-2 rounded-lg glass-subtle space-y-1">
                    <Mail className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                    <div className="font-semibold text-white">2. Opt Out</div>
                    <div className="text-[10px] text-slate-400">Web forms &amp; emails</div>
                  </div>
                  <div className="p-2 rounded-lg glass-subtle space-y-1">
                    <Clock className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
                    <div className="font-semibold text-white">3. Track 45d</div>
                    <div className="text-[10px] text-slate-400">Monitor responses</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2
                id="synout-tutorial-title"
                className="text-lg font-bold text-white tracking-tight"
              >
                Connect Your Email
              </h2>
              <p className="text-slate-300 leading-relaxed">
                In <strong>Email Removal</strong>, choose the connection option that fits your
                comfort level. Connect only email accounts that you own or are explicitly authorized
                to use.
              </p>

              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                <div className="text-[10px] text-slate-400">
                  Illustrative Connection Options Preview
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <div className="p-2 rounded-lg glass-subtle flex items-center justify-between gap-2">
                    <span className="text-white font-medium">
                      1-Click Webmail (Gmail, Outlook, Yahoo, Proton)
                    </span>
                    <span className="text-emerald-300">Default · No Password</span>
                  </div>
                  <div className="p-2 rounded-lg glass-subtle flex items-center justify-between gap-2">
                    <span className="text-white font-medium">Google OAuth 2.0 Sign-In</span>
                    <span className="text-sky-300">Consent Screen Review</span>
                  </div>
                  <div className="p-2 rounded-lg glass-subtle flex items-center justify-between gap-2">
                    <span className="text-white font-medium">
                      SMTP App Password (Gmail, iCloud, Custom)
                    </span>
                    <span className="text-slate-300">Session RAM Only</span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Carefully review any provider authorization screen before approving. You can
                disconnect your email at any time in Email Removal settings or click{' '}
                <strong>Purge Session</strong> in the footer.
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <h2
                id="synout-tutorial-title"
                className="text-lg font-bold text-white tracking-tight"
              >
                Understand Email Permissions
              </h2>
              <p className="text-slate-300 leading-relaxed">
                Permissions differ depending on how you connect your email account:
              </p>

              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-2.5 text-[11px]">
                <div className="space-y-1">
                  <div className="font-semibold text-white flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                    <span>Google OAuth Scopes (When Selected)</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    Requests <code className="text-sky-300">{GMAIL_SCOPES[0].split('/').pop()}</code>{' '}
                    (to send opt-out notices from your address),{' '}
                    <code className="text-sky-300">{GMAIL_SCOPES[1].split('/').pop()}</code> (used by
                    Inbox Harvester to search and read broker reply/confirmation messages and MIME
                    bodies in your browser to extract verification links and ticket IDs), plus{' '}
                    <code className="text-slate-300">openid</code>,{' '}
                    <code className="text-slate-300">email</code>, and{' '}
                    <code className="text-slate-300">profile</code>.
                  </p>
                </div>

                <div className="pt-2 border-t border-white/[0.06] space-y-1 text-slate-300">
                  <p>
                    <strong>1-Click Webmail:</strong> Opens pre-addressed drafts in your own mail
                    app—synOUT does not receive credentials or read inbox messages.
                  </p>
                  <p>
                    <strong>SMTP App Password:</strong> Sends outgoing opt-out emails using an
                    AES-256-GCM encrypted in-memory session token without reading inbox mail.
                  </p>
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2
                id="synout-tutorial-title"
                className="text-lg font-bold text-white tracking-tight"
              >
                Search and Discover Exposure
              </h2>
              <p className="text-slate-300 leading-relaxed">
                Run an <strong>Audit Scan</strong> using your name, city/state, and optional
                disambiguators (prior cities, phone, email, or birth year) across people-search,
                property, financial-marketing, and directory catalogs.
              </p>

              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                <div className="text-[10px] text-slate-400">
                  Illustrative Search &amp; Match Preview (Sample Data)
                </div>
                <div className="p-2.5 rounded-lg glass-subtle space-y-1 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-white font-semibold">Sample Consumer · Austin, TX</span>
                    <span className="text-amber-300">Verify Match</span>
                  </div>
                  <div className="text-slate-400">
                    Public-record directories often list homonyms (other people sharing your name).
                    Use <strong>Check Site</strong> or <strong>View Listing</strong> to verify
                    before acting.
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2
                id="synout-tutorial-title"
                className="text-lg font-bold text-white tracking-tight"
              >
                Understand ExposureReport
              </h2>
              <p className="text-slate-300 leading-relaxed">
                <strong>ExposureReport</strong> organizes matched data brokers by risk tier and
                category, highlights profile accuracy improvements via <strong>Quick Fix</strong>,
                and provides JSON, CSV, and PDF exports.
              </p>

              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-2 text-[11px]">
                <div className="text-[10px] text-slate-400">
                  Illustrative Exposure Card Statuses
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg glass-subtle">
                  <span className="inline-flex items-center gap-1.5 text-white font-medium">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
                    <span>Example Directory</span>
                  </span>
                  <span className="text-slate-300">Exposed → Submitted → Confirmed Removed</span>
                </div>
                <p className="text-slate-400 leading-snug">
                  Identifying potential exposure or sending an opt-out request is separate from
                  confirming that the external broker has actually removed your record.
                </p>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <h2
                id="synout-tutorial-title"
                className="text-lg font-bold text-white tracking-tight"
              >
                Submit and Track Opt-Out Requests
              </h2>
              <p className="text-slate-300 leading-relaxed">
                Review a broker&apos;s documented instructions, submit an opt-out via its online
                form or privacy email where supported, and monitor progress right inside each card.
              </p>

              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-2 text-[11px] tabular-nums">
                <div className="text-[10px] text-slate-400">
                  Illustrative 45-Day Mini-Timeline (Sample Data)
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sky-300 font-semibold">
                    <span>In Progress · Est. 45-Day Window</span>
                    <span className="text-slate-400 font-normal">Sent Oct 15</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                    <div className="h-full w-1/3 rounded-full bg-sky-400" />
                  </div>
                  <div className="grid grid-cols-3 text-[10px] text-slate-400">
                    <span>1. Submitted</span>
                    <span className="text-center text-sky-300">2. In Progress</span>
                    <span className="text-right">3. Expected Removal</span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 leading-snug">
                  The 45-calendar-day expected removal date is a planning estimate, not a guarantee.
                  Requests are only tracked after you submit or log them.
                </p>
              </div>
            </>
          )}

          {step === 6 && (
            <>
              <h2
                id="synout-tutorial-title"
                className="text-lg font-bold text-white tracking-tight"
              >
                Privacy Tactics
              </h2>
              <p className="text-slate-300 leading-relaxed">
                Click <strong>Privacy Tactics</strong> on any broker card in ExposureReport to
                review broker-specific data-minimization steps before submitting an opt-out.
              </p>

              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-2 text-[11px]">
                <div className="text-[10px] text-slate-400">
                  Illustrative Privacy Tactics Modal Preview
                </div>
                <div className="space-y-1.5">
                  <div className="p-2 rounded-lg glass-subtle flex items-start gap-2">
                    <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <div className="text-white font-medium">
                        Minimize Optional Fields &amp; Protect Sensitive Identifiers
                      </div>
                      <div className="text-slate-400">
                        Covers optional fields, DOB precautions, dedicated privacy email aliases,
                        and permitted ID redaction.
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 leading-snug">
                  Advice distinguishes verified broker documentation from general guidance and may
                  not apply to every individual situation.
                </p>
              </div>
            </>
          )}

          {step === 7 && (
            <>
              <h2
                id="synout-tutorial-title"
                className="text-lg font-bold text-white tracking-tight flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                <span>Ready to Begin</span>
              </h2>
              <p className="text-slate-300 leading-relaxed">
                You&apos;re ready to use synOUT. Connect an email account now if you want to send
                opt-out emails right away, or explore the audit scanner, broker directory, and
                guides on your own—connecting email is completely optional until you choose to send
                email requests.
              </p>

              <div className="pt-1 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    completeOnboardingTutorial();
                    onConnectEmailAndStart();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                >
                  <Mail className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Connect Email &amp; Get Started</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    completeOnboardingTutorial();
                    onExploreIndependently();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl glass-subtle hover:bg-white/[0.08] text-white font-semibold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                >
                  <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" aria-hidden="true" />
                  <span>Explore synOUT on My Own</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Bottom Navigation Bar */}
        <div className="px-4 py-3 sm:px-5 border-t border-white/[0.08] flex items-center justify-between gap-2 shrink-0 bg-slate-950/50">
          <button
            type="button"
            disabled={isFirstStep}
            onClick={() => setOnboardingStep(step - 1)}
            className="px-3 py-1.5 rounded-xl glass-subtle hover:bg-white/[0.08] text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Back</span>
          </button>

          {!isFinalStep ? (
            <button
              type="button"
              onClick={() => setOnboardingStep(step + 1)}
              className="px-4 py-1.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              <span>Next</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          ) : (
            <span className="text-[11px] text-slate-400">
              Reopen anytime via Footer → Tutorial
            </span>
          )}
        </div>
      </section>
    </div>
  );
};
