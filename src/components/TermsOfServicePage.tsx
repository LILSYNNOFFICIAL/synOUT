import React from 'react';
import { AlertTriangle, ArrowLeft, FileText, Mail, Scale } from 'lucide-react';

interface TermsOfServicePageProps {
  onReturnToWorkspace: () => void;
  onNavigateContact: () => void;
  onNavigatePrivacy: () => void;
}

interface TermsSectionMeta {
  id: string;
  number: string;
  title: string;
}

const TERMS_SECTIONS: ReadonlyArray<TermsSectionMeta> = [
  { id: 'tos-acceptance', number: '3.1', title: 'Acceptance of Terms' },
  { id: 'tos-description', number: '3.2', title: 'Description of the Service' },
  { id: 'tos-eligibility', number: '3.3', title: 'Eligibility & Accounts' },
  { id: 'tos-email-auth', number: '3.4', title: 'Authorized Email Connections' },
  { id: 'tos-accuracy', number: '3.5', title: 'Accuracy of Information' },
  { id: 'tos-optout-dates', number: '3.6', title: 'Opt-Out Requests & Expected Removal Dates' },
  { id: 'tos-third-party-brokers', number: '3.7', title: 'Third-Party Data Brokers' },
  { id: 'tos-acceptable-use', number: '3.8', title: 'Acceptable Use' },
  { id: 'tos-privacy-advice', number: '3.9', title: 'Privacy Advice & Informational Content' },
  { id: 'tos-availability', number: '3.10', title: 'Service Availability' },
  { id: 'tos-ip', number: '3.11', title: 'Intellectual Property' },
  { id: 'tos-liability', number: '3.12', title: 'Limitation of Liability' },
  { id: 'tos-changes', number: '3.13', title: 'Changes to the Service & Terms' },
  { id: 'tos-termination', number: '3.14', title: 'Suspension or Termination' },
  { id: 'tos-governing-law', number: '3.15', title: 'Governing Law & Disputes' },
  { id: 'tos-contact', number: '3.16', title: 'Contact' },
];

export const TermsOfServicePage: React.FC<TermsOfServicePageProps> = ({
  onReturnToWorkspace,
  onNavigateContact,
  onNavigatePrivacy,
}) => {
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
      {/* Top Header & Return Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <Scale className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>synOUT Service Terms &amp; Usage Expectations</span>
            <span aria-hidden="true">·</span>
            <span>Last Updated: October 28, 2026</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Terms of Service
          </h1>
          <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
            Clear terms governing your use of synOUT, authorized email connections, exposure
            reports, and the scope and limitations of opt-out assistance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onNavigatePrivacy}
            className="px-3.5 py-2 rounded-xl glass-subtle hover:bg-white/[0.08] text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            Privacy Policy
          </button>
          <button
            type="button"
            onClick={onNavigateContact}
            className="px-3.5 py-2 rounded-xl glass-subtle hover:bg-white/[0.08] text-xs font-medium text-emerald-300 transition-colors cursor-pointer whitespace-nowrap"
          >
            Contact Operator
          </button>
          <button
            type="button"
            onClick={onReturnToWorkspace}
            className="px-4 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Workspace</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <nav
          aria-label="Terms of Service Table of Contents"
          className="lg:col-span-4 xl:col-span-3 glass-panel rounded-2xl p-5 lg:sticky lg:top-28 space-y-3"
        >
          <div className="text-xs font-semibold text-white tracking-wide">
            Sections
          </div>
          <ul className="space-y-1 text-xs max-h-[65vh] overflow-y-auto pr-1">
            {TERMS_SECTIONS.map((sec) => (
              <li key={sec.id}>
                <button
                  type="button"
                  onClick={() => scrollToSection(sec.id)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors flex items-baseline gap-2 cursor-pointer"
                >
                  <span className="font-mono text-[11px] text-emerald-400 shrink-0 tabular-nums">
                    {sec.number}
                  </span>
                  <span className="truncate">{sec.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <article className="lg:col-span-8 xl:col-span-9 space-y-6">
          {/* 3.1 Acceptance of Terms */}
          <section
            id="tos-acceptance"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 3.1</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">Acceptance of Terms</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              By accessing or using synOUT, you agree to use the application in accordance with
              these Terms of Service and our{' '}
              <button
                type="button"
                onClick={onNavigatePrivacy}
                className="text-emerald-300 hover:text-emerald-200 underline underline-offset-4 cursor-pointer"
              >
                Privacy Policy
              </button>
              . If you do not agree to these Terms, discontinue use of synOUT. These Terms set
              practical rules and disclosures for using the software and are not a substitute for
              jurisdiction-specific legal review.
            </p>
          </section>

          {/* 3.2 Description of the Service */}
          <section
            id="tos-description"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 3.2</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              Description of the Service
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              synOUT provides tools designed to help you manage personal data exposure, including:
            </p>
            <ul className="space-y-1.5 text-xs text-slate-300 leading-relaxed list-disc pl-5">
              <li>Connecting supported email workflows (Webmail drafts, Google OAuth, or SMTP App Passwords) to dispatch privacy requests.</li>
              <li>Running personal information exposure searches and calibrating profile match details.</li>
              <li>Reviewing structured exposure reports, historical score trends, and exportable audit files.</li>
              <li>Browsing data broker directory metadata, opt-out portals, and state registry references.</li>
              <li>Preparing and submitting opt-out or deletion requests via email and automated or user-assisted online web forms.</li>
              <li>Tracking submitted opt-out requests, confirmation codes, inbox verification links, and estimated 45-day timelines.</li>
              <li>Reviewing broker-specific and general Privacy Tactics recommendations.</li>
            </ul>
          </section>

          {/* 3.3 Eligibility and Accounts */}
          <section
            id="tos-eligibility"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 3.3</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              Eligibility and Accounts
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              You must have legal capacity under applicable law to enter into agreements and submit
              privacy requests on your own behalf (or hold valid written legal authorization where
              acting as an authorized agent). Core synOUT tools work without creating an account; if
              you choose to sign in to the optional Cloud Vault, you are responsible for maintaining
              the confidentiality of your authentication credentials and your encryption passphrase.
              Because Cloud Vault bundles are encrypted client-side with your passphrase, losing
              your passphrase may prevent recovery of encrypted cloud backups.
            </p>
          </section>

          {/* 3.4 Authorized Email Connections */}
          <section
            id="tos-email-auth"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 3.4</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              Authorized Email Connections
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              You may connect only email accounts that you own or are explicitly authorized to use.
              Before completing any OAuth or App Password connection, you are responsible for
              reviewing the requested permissions, verifying that the sender address matches your
              intended identity or dedicated privacy alias, and disconnecting or revoking access
              whenever you no longer wish synOUT to use that connection.
            </p>
          </section>

          {/* 3.5 Accuracy of Information */}
          <section
            id="tos-accuracy"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 3.5</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">Accuracy of Information</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Exposure search results, broker metadata, and live portal checks rely on user-entered
              search vectors and publicly accessible external sources. External data broker records
              may be incomplete, outdated, inaccurate, or associated with another individual who
              shares a similar name, city, or age range. Exposure searches are not guaranteed to
              detect every website, database, or broker holding your personal information, and you
              should verify listing details before submitting sensitive requests.
            </p>
          </section>

          {/* 3.6 Opt-Out Requests and Expected Removal Dates */}
          <section
            id="tos-optout-dates"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 3.6</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              Opt-Out Requests and Expected Removal Dates
            </h2>
            <div className="glass-card rounded-xl p-4 space-y-2 text-xs text-slate-200 leading-relaxed">
              <div className="flex items-center gap-2 font-semibold text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Important Distinction: Submission vs. Verified Removal</span>
              </div>
              <p>
                Submitting an opt-out email or online web form is <strong className="text-white">not</strong>{' '}
                the same as confirmed deletion by a data broker. Many brokers require secondary
                email link confirmation, identity verification, or manual review before suppressing
                a record.
              </p>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              Where synOUT displays an expected removal date calculated as{' '}
              <strong className="text-white">45 calendar days</strong> from your recorded submission
              timestamp, that date is strictly a <strong className="text-white">planning estimate</strong>{' '}
              aligned with common statutory response windows—not a guarantee of removal. Actual
              processing times vary widely by broker, jurisdiction, request method, and verification
              requirements. <strong className="text-white">An expected removal date arriving or passing must never be interpreted as proof that your information has been removed.</strong>
            </p>
          </section>

          {/* 3.7 Third-Party Data Brokers */}
          <section
            id="tos-third-party-brokers"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 3.7</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              Third-Party Data Brokers
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Third-party data brokers, people-search directories, specialty bureaus, and search
              engines are independent entities that control their own databases, web forms, anti-bot
              challenges, verification rules, processing queues, and suppression decisions. synOUT
              has no control over third-party systems and cannot guarantee that any external broker
              will accept a request, honor a statutory deadline, or prevent your information from
              reappearing if reacquired from upstream public or commercial sources.
            </p>
          </section>

          {/* 3.8 Acceptable Use */}
          <section
            id="tos-acceptable-use"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 3.8</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">Acceptable Use</h2>
            <p className="text-sm text-slate-300 leading-relaxed">You agree not to use synOUT to:</p>
            <ul className="space-y-1.5 text-xs text-slate-300 leading-relaxed list-disc pl-5">
              <li>Violate any applicable local, state, national, or international law or regulation.</li>
              <li>Connect, access, or send messages from any email account without the account holder&apos;s authorization.</li>
              <li>Stalk, harass, dox, impersonate, or investigate other individuals&apos; private information without lawful authority.</li>
              <li>Submit fraudulent deletion demands, falsified identity documents, or unauthorized requests targeting third parties.</li>
              <li>Abuse, overload, scrape, or attempt to bypass security controls of synOUT&apos;s backend endpoints, email relays, or third-party services.</li>
            </ul>
          </section>

          {/* 3.9 Privacy Advice and Informational Content */}
          <section
            id="tos-privacy-advice"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 3.9</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              Privacy Advice and Informational Content
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              All content in synOUT—including Privacy Tactics modals, statutory guides, notice
              templates, regulator packet summaries, and Privacy Advisor responses—is provided for
              general informational and self-help purposes only. <strong className="text-white">synOUT is not a law firm, does not provide legal representation or legal advice, and does not create an attorney-client relationship.</strong>{' '}
              Informational recommendations do not guarantee any specific privacy or legal outcome.
              Consult a qualified attorney licensed in your jurisdiction if you require legal
              advice.
            </p>
          </section>

          {/* 3.10 Service Availability */}
          <section
            id="tos-availability"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 3.10</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">Service Availability</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              synOUT and its third-party integrations (including OAuth providers, SMTP servers,
              cloud databases, AI endpoints, and external broker portals) may experience downtime,
              rate limits, form layout changes, CAPTCHA blocks, or feature modifications without
              prior notice. We do not guarantee uninterrupted availability of any feature or
              automated workflow.
            </p>
          </section>

          {/* 3.11 Intellectual Property */}
          <section id="tos-ip" className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32">
            <div className="text-xs font-mono text-emerald-400">Section 3.11</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">Intellectual Property</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              The synOUT application interface, software code, visual design, original documentation,
              and branding remain the property of the synOUT operator and its licensors, subject to
              applicable open-source component licenses. You retain ownership of the personal
              information, notes, and exported reports you create using the service.
            </p>
          </section>

          {/* 3.12 Limitation of Liability */}
          <section
            id="tos-liability"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 3.12</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">Limitation of Liability</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              To the maximum extent permitted by applicable law, synOUT is provided on an &ldquo;as
              is&rdquo; and &ldquo;as available&rdquo; basis without warranties of merchantability,
              fitness for a particular purpose, or guaranteed data broker removal, and the operator
              shall not be liable for indirect, incidental, consequential, or third-party damages
              arising from external data broker actions, inaccurate third-party listings, email
              delivery failures, or service interruptions.
            </p>
            <p className="text-xs text-slate-300 leading-relaxed">
              <strong className="text-white">Preservation of non-waivable rights:</strong> Nothing
              in these Terms excludes, restricts, or waives any consumer right, warranty, or
              statutory remedy that cannot lawfully be waived or limited under the laws applicable
              to you.
            </p>
          </section>

          {/* 3.13 Changes to the Service and Terms */}
          <section
            id="tos-changes"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 3.13</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              Changes to the Service and Terms
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              We may update synOUT&apos;s features or revise these Terms over time to reflect
              technical improvements, integration changes, or legal requirements. Material updates
              to these Terms will be posted on this page with an updated{' '}
              <strong className="text-white">Last Updated</strong> date. Continued use of synOUT
              after updated Terms take effect constitutes acceptance of the revised Terms.
            </p>
          </section>

          {/* 3.14 Suspension or Termination */}
          <section
            id="tos-termination"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 3.14</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              Suspension or Termination
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              You may stop using synOUT, disconnect email accounts, or purge your local session at
              any time. The operator reserves the right to rate-limit, restrict, or suspend access
              to backend endpoints or cloud services if usage violates Section 3.8 (Acceptable Use),
              threatens infrastructure security, or is required to comply with applicable law.
            </p>
          </section>

          {/* 3.15 Governing Law and Disputes */}
          <section
            id="tos-governing-law"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 3.15</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              Governing Law and Disputes
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              These Terms are governed by applicable law without depriving you of mandatory consumer
              protections available in your place of residence. No specialized arbitration forum or
              exclusive venue clause has been established beyond default applicable law. If a
              concern or dispute arises regarding synOUT, please reach out through our Contact page
              first so we have an opportunity to address the issue informally.
            </p>
          </section>

          {/* 3.16 Contact */}
          <section
            id="tos-contact"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-4 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 3.16</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">Contact</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Questions about these Terms of Service can be sent directly to the synOUT operator via
              our Contact page.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onNavigateContact}
                className="px-4 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Mail className="w-4 h-4" />
                <span>Open Contact Page</span>
              </button>
              <button
                type="button"
                onClick={onNavigatePrivacy}
                className="px-4 py-2.5 rounded-xl glass-subtle hover:bg-white/[0.08] text-slate-200 text-xs font-medium inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <FileText className="w-4 h-4" />
                <span>View Privacy Policy</span>
              </button>
            </div>
          </section>
        </article>
      </div>
    </div>
  );
};
