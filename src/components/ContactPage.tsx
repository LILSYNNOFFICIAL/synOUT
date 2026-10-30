import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mail,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useEmailConnection } from '../services/emailConnectionStore';
import {
  ContactFieldErrors,
  OPERATOR_CONTACT_EMAIL,
  OPERATOR_CONTACT_SUBJECT,
  fetchContactServiceStatusClient,
  formatOperatorContactBody,
  sendContactViaGooglePopupClient,
  submitContactMessageClient,
  validateContactFieldsClient,
} from '../services/contactClient';
import { buildWebmailComposeUrls } from '../utils/emailProviderConfig';

interface ContactPageProps {
  onReturnToWorkspace: () => void;
  onOpenEmailSetup: () => void;
  onNavigatePrivacy: () => void;
  onNavigateTerms: () => void;
}

export const ContactPage: React.FC<ContactPageProps> = ({
  onReturnToWorkspace,
  onOpenEmailSetup,
  onNavigatePrivacy,
  onNavigateTerms,
}) => {
  const { isDirectSendConnected, activeConnectedEmail, oauthConfigured } = useEmailConnection();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');

  const [fieldErrors, setFieldErrors] = useState<ContactFieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSending, setIsGoogleSending] = useState(false);
  const [deliverySucceeded, setDeliverySucceeded] = useState(false);
  const [deliveryReceiptId, setDeliveryReceiptId] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const [operatorProviderConfigured, setOperatorProviderConfigured] = useState<boolean | null>(
    null
  );

  useEffect(() => {
    let active = true;
    void fetchContactServiceStatusClient().then((status) => {
      if (active) {
        setOperatorProviderConfigured(status.operatorProviderConfigured);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Pre-fill reply email if user has connected an email account and field is still empty
  useEffect(() => {
    if (activeConnectedEmail && !email) {
      setEmail(activeConnectedEmail);
    }
  }, [activeConnectedEmail]);

  const webmailLinks = useMemo(() => {
    const formatted = formatOperatorContactBody({
      name: name || 'synOUT User',
      email: email || activeConnectedEmail || '',
      message: message || '',
    });
    return buildWebmailComposeUrls(
      OPERATOR_CONTACT_EMAIL,
      OPERATOR_CONTACT_SUBJECT,
      formatted
    );
  }, [name, email, message, activeConnectedEmail]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting || isGoogleSending) return;

    setSubmissionError(null);
    setErrorCode(null);
    setDeliverySucceeded(false);

    const clientCheck = validateContactFieldsClient({ name, email, message });
    if (!clientCheck.valid) {
      setFieldErrors(clientCheck.errors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const result = await submitContactMessageClient({
        name,
        email,
        message,
        honeypot,
      });

      if (result.success && result.accepted) {
        setDeliverySucceeded(true);
        setDeliveryReceiptId(result.messageId || null);
        setSubmissionError(null);
        setErrorCode(null);
        setName('');
        setMessage('');
      } else {
        if (result.errors) {
          setFieldErrors(result.errors);
        }
        setErrorCode(result.errorCode || 'DELIVERY_FAILED');
        setSubmissionError(
          result.userMessage ||
            'Your message could not be sent right now. Your text has been preserved so you can try again.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignInAndSend = async () => {
    if (isSubmitting || isGoogleSending) return;
    setSubmissionError(null);
    setErrorCode(null);

    const clientCheck = validateContactFieldsClient({ name, email, message });
    if (!clientCheck.valid) {
      setFieldErrors(clientCheck.errors);
      return;
    }

    setFieldErrors({});
    setIsGoogleSending(true);
    try {
      const result = await sendContactViaGooglePopupClient({ name, email, message });
      if (result.success && result.accepted) {
        setDeliverySucceeded(true);
        setDeliveryReceiptId(result.messageId || null);
        setSubmissionError(null);
        setErrorCode(null);
        setName('');
        setMessage('');
      } else {
        setErrorCode(result.errorCode || 'DELIVERY_FAILED');
        setSubmissionError(
          result.userMessage || 'Google authorization did not complete. Your message is still saved below.'
        );
      }
    } catch (err) {
      setErrorCode('DELIVERY_FAILED');
      setSubmissionError(
        err instanceof Error
          ? err.message
          : 'Google sign-in popup was closed before sending. Your message is preserved below.'
      );
    } finally {
      setIsGoogleSending(false);
    }
  };

  const canTransmitAutomatically =
    Boolean(operatorProviderConfigured) || isDirectSendConnected;

  const showDirectSendBar =
    (operatorProviderConfigured === false && !isDirectSendConnected) ||
    errorCode === 'DIRECT_RELAY_REQUIRED' ||
    errorCode === 'EMAIL_PROVIDER_NOT_CONFIGURED' ||
    errorCode === 'NETWORK_ERROR';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <Mail className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Direct Operator Inquiry</span>
            <span aria-hidden="true">·</span>
            <span>Response Window: Within 72 Hours</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Contact synOUT
          </h1>
          <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
            Send privacy questions, support inquiries, or feedback directly to the synOUT operator.
          </p>
        </div>

        <button
          type="button"
          onClick={onReturnToWorkspace}
          className="self-start sm:self-auto px-4 py-2 rounded-xl glass-subtle hover:bg-white/[0.08] text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Workspace</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Contact Form Card */}
        <div className="lg:col-span-8 glass-panel rounded-2xl p-6 sm:p-8 space-y-6">
          {deliverySucceeded ? (
            <div
              role="status"
              aria-live="polite"
              className="glass-card rounded-2xl p-6 sm:p-8 border border-emerald-400/30 bg-emerald-500/[0.06] space-y-4"
            >
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <h2 className="text-lg font-bold text-white">Message sent successfully!</h2>
                  <p className="text-sm text-slate-200 leading-relaxed">
                    We&apos;ve received your message and will reach out within 72 hours of your
                    submission.
                  </p>
                  {deliveryReceiptId && (
                    <p className="text-xs font-mono text-slate-400 pt-1 break-all">
                      Delivery Reference: {deliveryReceiptId}
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDeliverySucceeded(false);
                    setDeliveryReceiptId(null);
                  }}
                  className="px-4 py-2 rounded-xl glass-subtle hover:bg-white/[0.08] text-xs font-medium text-white transition-colors cursor-pointer"
                >
                  Send Another Message
                </button>
                <button
                  type="button"
                  onClick={onReturnToWorkspace}
                  className="px-4 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Return to Workspace
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              {submissionError && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="glass-card rounded-xl p-4 border border-amber-400/35 bg-amber-500/[0.07] space-y-2"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                    <div className="space-y-1.5 text-xs">
                      <div className="font-semibold text-amber-200">
                        Choose Your Direct Delivery Method
                      </div>
                      <p className="text-slate-200 leading-relaxed">{submissionError}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Hidden Anti-Bot Honeypot */}
              <div className="sr-only" aria-hidden="true">
                <label htmlFor="contact-company-website">Leave this field empty</label>
                <input
                  id="contact-company-website"
                  name="companyWebsite"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </div>

              {/* Field 1: Name */}
              <div className="space-y-1.5">
                <label htmlFor="contact-name" className="block text-xs font-semibold text-slate-200">
                  Name <span className="text-emerald-400">*</span>
                </label>
                <input
                  id="contact-name"
                  name="name"
                  type="text"
                  required
                  maxLength={100}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (fieldErrors.name) {
                      setFieldErrors((prev) => ({ ...prev, name: undefined }));
                    }
                  }}
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? 'contact-name-error' : undefined}
                  placeholder="Your full name"
                  className={`w-full glass-input rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 ${
                    fieldErrors.name ? 'border-rose-400/60' : ''
                  }`}
                />
                {fieldErrors.name && (
                  <p id="contact-name-error" role="alert" className="text-xs text-rose-300">
                    {fieldErrors.name}
                  </p>
                )}
              </div>

              {/* Field 2: Email address */}
              <div className="space-y-1.5">
                <label
                  htmlFor="contact-email"
                  className="block text-xs font-semibold text-slate-200"
                >
                  Email address <span className="text-emerald-400">*</span>
                </label>
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  required
                  maxLength={160}
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) {
                      setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    }
                  }}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? 'contact-email-error' : undefined}
                  placeholder="yourname@email.com"
                  className={`w-full glass-input rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 ${
                    fieldErrors.email ? 'border-rose-400/60' : ''
                  }`}
                />
                {fieldErrors.email && (
                  <p id="contact-email-error" role="alert" className="text-xs text-rose-300">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              {/* Field 3: Message */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="contact-message"
                    className="block text-xs font-semibold text-slate-200"
                  >
                    Message <span className="text-emerald-400">*</span>
                  </label>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400">
                    {message.length.toLocaleString()} / 4,000
                  </span>
                </div>
                <textarea
                  id="contact-message"
                  name="message"
                  required
                  rows={6}
                  maxLength={4000}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    if (fieldErrors.message) {
                      setFieldErrors((prev) => ({ ...prev, message: undefined }));
                    }
                  }}
                  aria-invalid={Boolean(fieldErrors.message)}
                  aria-describedby={fieldErrors.message ? 'contact-message-error' : undefined}
                  placeholder="How can we help with your privacy workspace, opt-out workflow, or policy questions?"
                  className={`w-full glass-input rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 resize-y min-h-[140px] ${
                    fieldErrors.message ? 'border-rose-400/60' : ''
                  }`}
                />
                {fieldErrors.message && (
                  <p id="contact-message-error" role="alert" className="text-xs text-rose-300">
                    {fieldErrors.message}
                  </p>
                )}
              </div>

              {fieldErrors.form && (
                <p role="alert" className="text-xs text-rose-300">
                  {fieldErrors.form}
                </p>
              )}

              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-slate-400">
                  {canTransmitAutomatically ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-300">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>Verified direct email relay active · Sends to {OPERATOR_CONTACT_EMAIL}</span>
                    </span>
                  ) : (
                    <span>
                      Destination: <span className="font-mono text-slate-300">{OPERATOR_CONTACT_EMAIL}</span> · Subject:{' '}
                      <span className="font-mono text-slate-300">{OPERATOR_CONTACT_SUBJECT}</span>
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || isGoogleSending}
                  className="px-5 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 disabled:opacity-55 disabled:cursor-not-allowed text-slate-950 text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending Message...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send Message</span>
                    </>
                  )}
                </button>
              </div>

              {/* Serverless & Direct-Send Instant Options (works on GitHub Pages without a backend) */}
              {showDirectSendBar && (
                <div className="pt-4 border-t border-white/[0.08] space-y-3 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="font-semibold text-slate-200">
                      Instant Serverless &amp; Direct-Send Options
                    </span>
                    <button
                      type="button"
                      onClick={onOpenEmailSetup}
                      className="text-emerald-300 hover:text-emerald-200 underline underline-offset-4 cursor-pointer self-start sm:self-auto whitespace-nowrap"
                    >
                      Configure Email Relay
                    </button>
                  </div>

                  <p className="text-slate-400 leading-relaxed">
                    Send immediately with one click via Google Sign-In (confirming delivery to{' '}
                    <span className="font-mono text-slate-300">{OPERATOR_CONTACT_EMAIL}</span>), or
                    open a pre-addressed draft in your preferred email client:
                  </p>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {oauthConfigured && (
                      <button
                        type="button"
                        disabled={isGoogleSending || isSubmitting}
                        onClick={() => void handleGoogleSignInAndSend()}
                        className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-55 text-slate-950 font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {isGoogleSending ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Signing in &amp; Sending...</span>
                          </>
                        ) : (
                          <>
                            <Mail className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Sign in with Google &amp; Send Now</span>
                          </>
                        )}
                      </button>
                    )}

                    <a
                      href={webmailLinks.gmailUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 rounded-xl glass-subtle hover:bg-white/[0.08] text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <span>Open in Gmail</span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </a>

                    <a
                      href={webmailLinks.outlookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 rounded-xl glass-subtle hover:bg-white/[0.08] text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <span>Open in Outlook</span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </a>

                    <a
                      href={webmailLinks.mailtoUrl}
                      className="px-3.5 py-2 rounded-xl glass-subtle hover:bg-white/[0.08] text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <span>Default Mail App</span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </a>
                  </div>
                </div>
              )}
            </form>
          )}
        </div>

        {/* Side Info Panel */}
        <aside className="lg:col-span-4 space-y-4">
          <div className="glass-panel rounded-2xl p-6 space-y-3">
            <h2 className="text-sm font-semibold text-white">Operator Contact Details</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Messages submitted on this page are validated and delivered with your email set as the{' '}
              <code className="text-slate-200">Reply-To</code> header so our team can respond
              directly.
            </p>
            <div className="pt-2 border-t border-white/[0.06] space-y-1.5 text-xs">
              <div className="text-slate-400">Destination Mailbox</div>
              <div className="font-mono text-emerald-300 break-all">synovamedia@gmail.com</div>
            </div>
            <div className="pt-2 border-t border-white/[0.06] space-y-1.5 text-xs">
              <div className="text-slate-400">Expected Response Time</div>
              <div className="text-slate-200">Within 72 hours of confirmed submission</div>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6 space-y-3 text-xs">
            <h2 className="text-sm font-semibold text-white">Legal &amp; Policy Reference</h2>
            <p className="text-slate-400 leading-relaxed">
              Review how synOUT handles workspace data, connected email permissions, and third-party
              data broker limitations:
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onNavigatePrivacy}
                className="text-emerald-300 hover:text-emerald-200 underline underline-offset-4 cursor-pointer"
              >
                Privacy Policy
              </button>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <button
                type="button"
                onClick={onNavigateTerms}
                className="text-emerald-300 hover:text-emerald-200 underline underline-offset-4 cursor-pointer"
              >
                Terms of Service
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
