import React from 'react';
import { ArrowLeft, Lock, Mail, Shield } from 'lucide-react';

interface PrivacyPolicyPageProps {
  onReturnToWorkspace: () => void;
  onNavigateContact: () => void;
  onNavigateTerms: () => void;
}

interface PolicySectionMeta {
  id: string;
  number: string;
  title: string;
}

const PRIVACY_SECTIONS: ReadonlyArray<PolicySectionMeta> = [
  { id: 'pp-intro', number: '2.1', title: 'Introduction' },
  { id: 'pp-collection', number: '2.2', title: 'Information We Collect' },
  { id: 'pp-email-permissions', number: '2.3', title: 'Email Connections & Permissions' },
  { id: 'pp-use', number: '2.4', title: 'How Information Is Used' },
  { id: 'pp-third-parties', number: '2.5', title: 'Third-Party Services' },
  { id: 'pp-storage-security', number: '2.6', title: 'Storage, Security & Retention' },
  { id: 'pp-sharing', number: '2.7', title: 'Data Sharing' },
  { id: 'pp-rights', number: '2.8', title: 'User Choices & Rights' },
  { id: 'pp-children', number: '2.9', title: "Children's Privacy" },
  { id: 'pp-international', number: '2.10', title: 'International Processing' },
  { id: 'pp-updates', number: '2.11', title: 'Policy Updates' },
  { id: 'pp-contact', number: '2.12', title: 'Contact' },
];

export const PrivacyPolicyPage: React.FC<PrivacyPolicyPageProps> = ({
  onReturnToWorkspace,
  onNavigateContact,
  onNavigateTerms,
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
            <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>synOUT Legal &amp; Transparency Documentation</span>
            <span aria-hidden="true">·</span>
            <span>Last Updated: October 28, 2026</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
            Plain-language documentation of what information synOUT processes, how email
            permissions and local or encrypted cloud storage work, and what controls remain in your
            hands.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onNavigateTerms}
            className="px-3.5 py-2 rounded-xl glass-subtle hover:bg-white/[0.08] text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            Terms of Service
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

      {/* Main Content Layout with Sticky Table of Contents */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <nav
          aria-label="Privacy Policy Table of Contents"
          className="lg:col-span-4 xl:col-span-3 glass-panel rounded-2xl p-5 lg:sticky lg:top-28 space-y-3"
        >
          <div className="text-xs font-semibold text-white tracking-wide">
            Contents
          </div>
          <ul className="space-y-1 text-xs">
            {PRIVACY_SECTIONS.map((sec) => (
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
          {/* 2.1 Introduction */}
          <section id="pp-intro" className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32">
            <div className="text-xs font-mono text-emerald-400">Section 2.1</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">Introduction</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              synOUT is a personal data privacy workspace that helps users search for potential
              personal information exposure across commercial data brokers, review exposure reports,
              prepare and submit statutory opt-out or deletion requests via email and online web
              forms, monitor opt-out timelines, and review broker-specific privacy guidance.
            </p>
            <p className="text-sm text-slate-300 leading-relaxed">
              This Privacy Policy explains what categories of information synOUT collects or
              processes, how connected email permissions operate, which third-party services are
              involved when you use specific features, and how you can inspect, export, or purge
              your workspace data. If you have questions about how your information is handled, you
              can contact the synOUT operator directly through our{' '}
              <button
                type="button"
                onClick={onNavigateContact}
                className="text-emerald-300 hover:text-emerald-200 underline underline-offset-4 cursor-pointer"
              >
                Contact page
              </button>
              .
            </p>
          </section>

          {/* 2.2 Information We Collect */}
          <section
            id="pp-collection"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-4 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 2.2</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">Information We Collect</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              synOUT processes only the categories of information supported by the features you
              choose to use. We distinguish between information you provide or generate directly
              within synOUT and information retrieved from external sources or third-party services.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="glass-card rounded-xl p-5 space-y-2.5">
                <h3 className="text-sm font-semibold text-white">
                  A. Information Provided or Generated Directly in synOUT
                </h3>
                <ul className="space-y-2 text-xs text-slate-300 leading-relaxed list-disc pl-4">
                  <li>
                    <strong className="text-white">Search queries &amp; profile vectors:</strong>{' '}
                    Name, city, state, optional street address and ZIP code, birth year, phone
                    numbers, email addresses, relatives, prior locations, and up to 10 saved search
                    slots stored in your browser workspace.
                  </li>
                  <li>
                    <strong className="text-white">Account &amp; Cloud Vault authentication:</strong>{' '}
                    If you enable optional Cloud Vault sync, Firebase Authentication processes your
                    sign-in email address, authentication UID, and Google or email/password
                    credentials, while your vault passphrase derives an encryption key locally in
                    your browser.
                  </li>
                  <li>
                    <strong className="text-white">Email connection details:</strong> Your chosen
                    sender email address, connection mode (<code className="text-slate-200">webmail</code>,{' '}
                    <code className="text-slate-200">oauth</code>, or{' '}
                    <code className="text-slate-200">smtp</code>), and, when using SMTP App
                    Passwords, an ephemeral encrypted session credential held in server memory.
                  </li>
                  <li>
                    <strong className="text-white">Opt-out &amp; workspace records:</strong>{' '}
                    Submitted opt-out timestamps, email Message-IDs, web-form tracking references,
                    broker reply triage notes, optional signed Power of Attorney authorization
                    fields, specialty bureau checklists, canary email aliases, and onboarding
                    tutorial status.
                  </li>
                  <li>
                    <strong className="text-white">Contact form submissions:</strong> Your name,
                    email address, and message text when you submit an inquiry on the Contact page.
                  </li>
                  <li>
                    <strong className="text-white">Technical session &amp; security metadata:</strong>{' '}
                    Per-session cryptographic isolation header (<code className="text-slate-200">X-Synout-Session</code>),
                    in-memory IP/session rate-limit counters, duplicate-submission hashes, and basic
                    request status diagnostics.
                  </li>
                </ul>
              </div>

              <div className="glass-card rounded-xl p-5 space-y-2.5">
                <h3 className="text-sm font-semibold text-white">
                  B. Information Retrieved from External or Third-Party Sources
                </h3>
                <ul className="space-y-2 text-xs text-slate-300 leading-relaxed list-disc pl-4">
                  <li>
                    <strong className="text-white">Broker directory &amp; portal metadata:</strong>{' '}
                    Curated data broker domains, categories, documented opt-out URLs, privacy email
                    addresses, DNS MX deliverability checks, and live public web-form field or
                    anti-bot inspections when you run a portal probe or automated form workflow.
                  </li>
                  <li>
                    <strong className="text-white">Exposure report assessments:</strong> Exposure
                    candidates generated from broker profile matching rules together with any
                    opt-in live public listing checks you trigger from the interface.
                  </li>
                  <li>
                    <strong className="text-white">Connected Gmail verification messages:</strong>{' '}
                    Only when you explicitly connect Google OAuth and run the Inbox Harvester,
                    synOUT queries matching broker confirmation messages and headers via the Gmail
                    API so you can extract or complete opt-out verification links.
                  </li>
                  <li>
                    <strong className="text-white">Live web broker intelligence:</strong> When you
                    click Live Web Intel or ask the Privacy Advisor for current broker policies,
                    search-grounded public web citations are retrieved to summarize published
                    requirements.
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* 2.3 Email Connections and Permissions */}
          <section
            id="pp-email-permissions"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-4 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 2.3</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              Email Connections and Permissions
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Connecting an email account is optional for browsing synOUT, running local exposure
              searches, or using manual web-form guides, and is used when you want synOUT to send
              opt-out notices or check broker confirmation replies on your behalf. synOUT supports
              three connection modes with distinct permission boundaries:
            </p>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <div className="glass-card rounded-xl p-4 space-y-1.5">
                <div className="font-semibold text-white flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>1. Webmail Compose Mode (Gmail, Outlook, Yahoo, Proton, Default Mail)</span>
                </div>
                <p>
                  Requests zero mailbox permissions and zero passwords. synOUT stores your entered
                  sender address locally in your browser and opens pre-addressed statutory opt-out
                  drafts directly in your webmail tab or default mail application so you review and
                  click send yourself.
                </p>
              </div>

              <div className="glass-card rounded-xl p-4 space-y-1.5">
                <div className="font-semibold text-white flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>2. Google OAuth 2.0 Connection (Client-Side Authorized Scopes)</span>
                </div>
                <p>
                  When configured and selected, Google Identity Services prompts you on Google&apos;s
                  consent screen to authorize the following exact OAuth scopes:
                </p>
                <ul className="list-disc pl-5 space-y-1 font-mono text-[11px] text-slate-200">
                  <li>https://www.googleapis.com/auth/gmail.send</li>
                  <li>https://www.googleapis.com/auth/gmail.readonly</li>
                  <li>openid, email, profile</li>
                </ul>
                <p>
                  <strong className="text-white">How messages and metadata are accessed:</strong>{' '}
                  <code className="text-slate-200">gmail.send</code> is used to transmit opt-out and
                  statutory follow-up emails that you initiate.{' '}
                  <code className="text-slate-200">gmail.readonly</code> is used by the Inbox
                  Harvester when you scan your inbox for data-broker opt-out confirmation emails,
                  allowing synOUT in your browser session to read matching message headers (sender,
                  subject, date) and message body snippets/links to detect verification URLs and
                  confirmation tickets. Because <code className="text-slate-200">gmail.readonly</code>{' '}
                  grants read access to matching messages during those scans, synOUT does{' '}
                  <strong className="text-white">not</strong> claim that email contents are never
                  read or processed when you use Google OAuth inbox features. Attachments are not
                  downloaded or stored by synOUT. Access tokens are held in browser session storage
                  until they expire or you disconnect.
                </p>
              </div>

              <div className="glass-card rounded-xl p-4 space-y-1.5">
                <div className="font-semibold text-white flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>3. Direct SMTP App Password Mode (Gmail, Outlook, Yahoo, iCloud, Custom SMTP)</span>
                </div>
                <p>
                  When you connect via a provider App Password, your email address and App Password
                  are sent over HTTPS to the synOUT server to verify SMTP login and are held only in
                  ephemeral server RAM encrypted with <code className="text-slate-200">AES-256-GCM</code>{' '}
                  (scoped to your session token and automatically expiring after 12 hours or server
                  restart). Plaintext App Passwords are never saved in browser{' '}
                  <code className="text-slate-200">localStorage</code> or written to database disk.
                  SMTP mode only sends outbound emails and cannot read your inbox.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed pt-1">
              <strong className="text-white">Disconnecting your account:</strong> You can disconnect
              any email connection at any time in the Email Removal workspace or wipe all session
              state using <strong className="text-white">Purge Session</strong> in the footer (and
              you can revoke Google OAuth access directly in your Google Account security settings).
              Disconnecting immediately stops future email sends and clears active OAuth tokens or
              ephemeral server SMTP credentials; previously recorded scan results or opt-out
              tracking entries in your local browser workspace remain available to you until you
              delete them or purge your session.
            </p>
          </section>

          {/* 2.4 How Information Is Used */}
          <section id="pp-use" className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32">
            <div className="text-xs font-mono text-emerald-400">Section 2.4</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">How Information Is Used</h2>
            <ul className="space-y-2 text-sm text-slate-300 leading-relaxed list-disc pl-5">
              <li>Providing synOUT&apos;s exposure search, profile calibration (Quick Fix), and multi-profile search management.</li>
              <li>Identifying potential personal information exposure across cataloged and newly discovered data brokers.</li>
              <li>Displaying your ExposureReport, historical score trend charts, and printable/exportable documentation (JSON, CSV, Markdown, and PDF).</li>
              <li>Supporting opt-out workflows, including generating statutory deletion notices, dispatching authorized emails, running automated or assisted online opt-out form workflows, and tracking 45-day estimated timelines.</li>
              <li>Maintaining optional user accounts and zero-knowledge client-encrypted Cloud Vault synchronization across devices.</li>
              <li>Delivering and responding to inquiries submitted through the Contact page.</li>
              <li>Enforcing rate limits, preventing duplicate or abusive submissions, blocking unsafe SSRF network targets, and maintaining service reliability and security.</li>
              <li>Complying with applicable legal obligations.</li>
            </ul>
          </section>

          {/* 2.5 Third-Party Services */}
          <section
            id="pp-third-parties"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 2.5</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">Third-Party Services</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Depending on which synOUT features you activate, your requests interact with the
              following categories of third-party providers:
            </p>
            <ul className="space-y-2 text-xs text-slate-300 leading-relaxed list-disc pl-5">
              <li>
                <strong className="text-white">Firebase Authentication &amp; Cloud Firestore (Google Cloud):</strong>{' '}
                Used when you sign in to the optional Cloud Vault to authenticate your account and
                store client-encrypted workspace bundles.
              </li>
              <li>
                <strong className="text-white">Google Identity Services &amp; Gmail API:</strong>{' '}
                Used when you choose Google OAuth to send opt-out notices or scan for broker
                confirmation emails.
              </li>
              <li>
                <strong className="text-white">User-Selected Email / SMTP Providers:</strong>{' '}
                Gmail, Microsoft Outlook/Hotmail, Yahoo Mail, Apple iCloud Mail, Proton Mail Bridge,
                or custom SMTP relays that you configure to dispatch opt-out messages.
              </li>
              <li>
                <strong className="text-white">Google Gemini API (Server-Side):</strong>{' '}
                Used when configured on the backend to refine statutory notice text, power the
                Privacy &amp; Opt-Out Advisor, and perform search-grounded lookups of public broker
                opt-out rules (with server-side redaction of SSN, driver&apos;s license, and payment
                card patterns).
              </li>
              <li>
                <strong className="text-white">Transactional Email Provider (Contact Form):</strong>{' '}
                Used by the backend (via configured SMTP, Resend, SendGrid, or your active
                direct-send session) to deliver Contact page submissions to{' '}
                <code className="text-slate-200">synovamedia@gmail.com</code>.
              </li>
              <li>
                <strong className="text-white">External Data Brokers &amp; Search Engines:</strong>{' '}
                When you open a broker link, probe a public portal, or submit an opt-out email or
                online form, the information included in that request is transmitted directly to
                that third-party broker.
              </li>
            </ul>
            <p className="text-xs text-slate-400 leading-relaxed">
              Each third-party service and external data broker operates independently under its own
              terms of service and privacy policy.
            </p>
          </section>

          {/* 2.6 Storage, Security, and Retention */}
          <section
            id="pp-storage-security"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 2.6</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              Storage, Security, and Retention
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              <strong className="text-white">How data is stored:</strong> By default, your profile
              inputs, exposure scan results, saved searches, checklists, and opt-out tracking status
              are stored locally in your browser&apos;s <code className="text-slate-200">localStorage</code>.
              If you enable Cloud Vault sync, your workspace bundle is encrypted in your browser
              using <code className="text-slate-200">PBKDF2-SHA256</code> key derivation and{' '}
              <code className="text-slate-200">AES-256-GCM</code> authenticated encryption before
              ciphertext is stored in Firebase Cloud Firestore under your authenticated user ID.
            </p>
            <p className="text-sm text-slate-300 leading-relaxed">
              <strong className="text-white">Implemented safeguards:</strong> synOUT enforces
              owner-scoped Firestore security rules, per-client cryptographic session tokens for
              server workflows, ephemeral RAM-only <code className="text-slate-200">AES-256-GCM</code>{' '}
              wrapping for SMTP App Passwords, private-IP SSRF blocking on server URL probes, input
              validation, and rate limiting. However, no software application, browser environment,
              or network transmission can guarantee absolute security.
            </p>
            <p className="text-sm text-slate-300 leading-relaxed">
              <strong className="text-white">Retention:</strong> Local browser data remains on your
              device until you clear your browser storage or use <strong className="text-white">Purge Session</strong>.
              Ephemeral server-side SMTP credentials and workflow jobs automatically expire in
              memory (within 12 hours or upon server restart) or immediately when you purge your
              session. Encrypted Cloud Vault snapshots remain in Firestore until overwritten or
              deleted through your account. Formal automated deletion timelines for operator inbox
              messages sent to <code className="text-slate-200">synovamedia@gmail.com</code> and
              hosting infrastructure logs have not yet been established; you may request deletion of
              prior Contact submissions at any time via the Contact page.
            </p>
          </section>

          {/* 2.7 Data Sharing */}
          <section
            id="pp-sharing"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 2.7</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">Data Sharing</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              synOUT does <strong className="text-white">not</strong> sell your personal information
              to data brokers, marketers, or advertising networks. Information is shared or
              transmitted externally only in the following circumstances:
            </p>
            <ul className="space-y-2 text-xs text-slate-300 leading-relaxed list-disc pl-5">
              <li>
                <strong className="text-white">User-directed opt-out &amp; workspace actions:</strong>{' '}
                When you instruct synOUT to send an opt-out email or submit an online opt-out form,
                the identifying details needed to locate and suppress your record are sent to that
                target data broker through your selected channel.
              </li>
              <li>
                <strong className="text-white">Service providers necessary to operate features:</strong>{' '}
                Authentication, cloud storage (encrypted Cloud Vault), email transport, and server
                hosting/AI APIs process request data strictly as needed to execute the feature you
                invoke.
              </li>
              <li>
                <strong className="text-white">Legal obligations &amp; safety:</strong> Information
                held by the operator (such as Contact inquiries or server security logs) may be
                disclosed if required by applicable law, subpoena, or valid legal process, or to
                protect the security and integrity of the service against abuse.
              </li>
            </ul>
          </section>

          {/* 2.8 User Choices and Rights */}
          <section
            id="pp-rights"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 2.8</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">User Choices and Rights</h2>
            <ul className="space-y-2 text-xs text-slate-300 leading-relaxed list-disc pl-5">
              <li>
                <strong className="text-white">Disconnect email &amp; revoke permissions:</strong>{' '}
                Disconnect Webmail, Google OAuth, or SMTP connections at any time in the Email
                Removal tab, and revoke OAuth tokens in your Google Account permissions page.
              </li>
              <li>
                <strong className="text-white">Inspect, update, or export your data:</strong> Edit
                your profile vectors directly in the Audit Scan form or Quick Fix helper, and export
                your records at any time as JSON, CSV, Markdown, PDF, or an encrypted Vault file.
              </li>
              <li>
                <strong className="text-white">Purge local &amp; session data:</strong> Use the{' '}
                <strong className="text-white">Purge Session</strong> control in the global footer
                to wipe browser <code className="text-slate-200">localStorage</code>, active OAuth/SMTP
                session state, and in-memory server workflow records.
              </li>
              <li>
                <strong className="text-white">Access, correction &amp; deletion requests:</strong>{' '}
                Depending on where you live (such as California, Texas, Virginia, Colorado,
                Connecticut, Oregon, the European Economic Area, or the United Kingdom), applicable
                law may grant specific rights to request access to, correction of, or deletion of
                personal information held by a service operator. Because privacy rights vary by
                jurisdiction, you can submit any privacy inquiry or deletion request through our
                Contact page and we will review and respond in accordance with applicable law.
              </li>
            </ul>
          </section>

          {/* 2.9 Children's Privacy */}
          <section
            id="pp-children"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 2.9</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">Children&apos;s Privacy</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              synOUT is intended for individuals managing their own digital privacy (or acting with
              lawful written authority) and is not directed toward children. synOUT does not
              implement age-verification screening, and we do not knowingly solicit personal
              information directly from children. If you believe a child&apos;s personal information
              has been submitted to the synOUT operator through the Contact form or an account
              without appropriate authorization, please notify us via the Contact page so we can
              delete the relevant records.
            </p>
          </section>

          {/* 2.10 International Processing */}
          <section
            id="pp-international"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 2.10</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              International Processing
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              synOUT&apos;s application hosting, Google Cloud / Firebase infrastructure, email
              delivery providers, and most cataloged commercial data brokers operate servers located
              in the United States and potentially other jurisdictions. If you access synOUT from
              outside the United States, information transmitted to cloud infrastructure, email
              providers, or external data brokers may be processed in countries whose data
              protection laws differ from those in your home jurisdiction.
            </p>
          </section>

          {/* 2.11 Policy Updates */}
          <section
            id="pp-updates"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-3 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 2.11</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">Policy Updates</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              We may revise this Privacy Policy when synOUT adds or changes features, integrations,
              or data-handling practices. When material changes are made, we will update the{' '}
              <strong className="text-white">Last Updated</strong> date at the top of this page (and
              provide additional in-app notice where appropriate). Updated terms take effect when
              posted unless a later effective date is stated.
            </p>
          </section>

          {/* 2.12 Contact */}
          <section
            id="pp-contact"
            className="glass-panel rounded-2xl p-6 sm:p-8 space-y-4 scroll-mt-32"
          >
            <div className="text-xs font-mono text-emerald-400">Section 2.12</div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">Contact</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              For questions, feedback, or privacy requests regarding this Privacy Policy or
              synOUT&apos;s data practices, submit a message directly to the synOUT operator using
              our dedicated Contact page.
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
                onClick={onReturnToWorkspace}
                className="px-4 py-2.5 rounded-xl glass-subtle hover:bg-white/[0.08] text-slate-200 text-xs font-medium inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to Workspace</span>
              </button>
            </div>
          </section>
        </article>
      </div>
    </div>
  );
};
