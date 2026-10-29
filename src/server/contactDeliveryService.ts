import crypto from 'crypto';
import nodemailer from 'nodemailer';

export const OPERATOR_CONTACT_RECIPIENT = 'synovamedia@gmail.com';
export const OPERATOR_CONTACT_SUBJECT = 'synOUT MESSAGE';

export interface ContactSubmissionInput {
  name?: unknown;
  email?: unknown;
  message?: unknown;
  honeypot?: unknown;
}

export interface ValidatedContactPayload {
  name: string;
  email: string;
  message: string;
  fingerprintSha256: string;
}

export interface ContactValidationResult {
  valid: boolean;
  errors: {
    name?: string;
    email?: string;
    message?: string;
    form?: string;
  };
  payload?: ValidatedContactPayload;
}

export interface ContactDeliveryContext {
  sessionSmtp?: {
    userEmail: string;
    normalizedAuthPass: string;
    resolvedHost: string;
    resolvedPort: number;
    resolvedSecure: boolean;
  } | null;
  oauthBearerToken?: string | null;
  customTransporterForTests?: {
    sendMail: (options: {
      from: string;
      replyTo: string;
      to: string;
      subject: string;
      text: string;
    }) => Promise<{ messageId?: string; accepted?: unknown[]; rejected?: unknown[] }>;
  } | null;
}

export interface ContactDeliveryResult {
  success: boolean;
  httpStatus: number;
  accepted: boolean;
  provider?: 'operator_smtp' | 'resend_api' | 'sendgrid_api' | 'session_smtp' | 'gmail_oauth' | 'test_transport';
  messageId?: string;
  errorCode?:
    | 'VALIDATION_FAILED'
    | 'RATE_LIMITED'
    | 'DUPLICATE_SUBMISSION'
    | 'EMAIL_PROVIDER_NOT_CONFIGURED'
    | 'DELIVERY_FAILED';
  userMessage: string;
  errors?: ContactValidationResult['errors'];
}

const CONTACT_EMAIL_REGEX = /^[^\s@<>"'\\,;:\r\n]+@[^\s@<>"'\\,;:\r\n]+\.[a-zA-Z]{2,24}$/;

// Rate limit: max 5 contact submissions per 15 minutes per client key
const CONTACT_RATE_WINDOW_MS = 15 * 60 * 1000;
const CONTACT_MAX_SUBMISSIONS_PER_WINDOW = 5;
const contactRateMap = new Map<string, { count: number; resetAtMs: number }>();

// Duplicate guard: 10-minute window keyed by SHA-256 of normalized (email|name|message)
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
const recentFingerprints = new Map<string, number>();

function stripHeaderControlChars(value: string): string {
  return value.replace(/[\r\n\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeMessageBody(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

export function computeContactFingerprint(name: string, email: string, message: string): string {
  const canonical = `${email.toLowerCase().trim()}|${name.toLowerCase().trim()}|${message
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()}`;
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function validateContactSubmission(input: ContactSubmissionInput): ContactValidationResult {
  const errors: ContactValidationResult['errors'] = {};

  // Silent bot honeypot check
  if (typeof input.honeypot === 'string' && input.honeypot.trim().length > 0) {
    return {
      valid: false,
      errors: { form: 'Unable to process submission. Please refresh and try again.' },
    };
  }

  const rawName = typeof input.name === 'string' ? stripHeaderControlChars(input.name) : '';
  const rawEmail = typeof input.email === 'string' ? stripHeaderControlChars(input.email).toLowerCase() : '';
  const rawMessage = typeof input.message === 'string' ? sanitizeMessageBody(input.message) : '';

  if (!rawName) {
    errors.name = 'Please enter your name.';
  } else if (rawName.length < 2) {
    errors.name = 'Name must be at least 2 characters.';
  } else if (rawName.length > 100) {
    errors.name = 'Name must be 100 characters or fewer.';
  }

  if (!rawEmail) {
    errors.email = 'Please enter your email address.';
  } else if (rawEmail.length > 160 || !CONTACT_EMAIL_REGEX.test(rawEmail)) {
    errors.email = 'Please enter a valid email address (for example, name@example.com).';
  }

  if (!rawMessage) {
    errors.message = 'Please enter a message before submitting.';
  } else if (rawMessage.length < 10) {
    errors.message = 'Message must be at least 10 characters so we can assist you.';
  } else if (rawMessage.length > 4000) {
    errors.message = 'Message must be 4,000 characters or fewer.';
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: {},
    payload: {
      name: rawName,
      email: rawEmail,
      message: rawMessage,
      fingerprintSha256: computeContactFingerprint(rawName, rawEmail, rawMessage),
    },
  };
}

export function checkContactRateLimit(clientKey: string, nowMs = Date.now()): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  // Prune expired records periodically
  if (contactRateMap.size > 500) {
    for (const [k, rec] of contactRateMap.entries()) {
      if (nowMs > rec.resetAtMs) contactRateMap.delete(k);
    }
  }

  const existing = contactRateMap.get(clientKey);
  if (!existing || nowMs > existing.resetAtMs) {
    contactRateMap.set(clientKey, { count: 1, resetAtMs: nowMs + CONTACT_RATE_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= CONTACT_MAX_SUBMISSIONS_PER_WINDOW) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAtMs - nowMs) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function isDuplicateContactFingerprint(fingerprint: string, nowMs = Date.now()): boolean {
  for (const [fp, expiresAt] of recentFingerprints.entries()) {
    if (nowMs > expiresAt) recentFingerprints.delete(fp);
  }
  const existingExpiry = recentFingerprints.get(fingerprint);
  return Boolean(existingExpiry && nowMs <= existingExpiry);
}

export function recordContactFingerprint(fingerprint: string, nowMs = Date.now()): void {
  recentFingerprints.set(fingerprint, nowMs + DUPLICATE_WINDOW_MS);
}

export function resetContactAbuseGuardsForTests(): void {
  contactRateMap.clear();
  recentFingerprints.clear();
}

export function formatContactPlainTextBody(payload: ValidatedContactPayload, submittedIso: string): string {
  return [
    'synOUT Contact Submission',
    '------------------------------------------------------------',
    `Sender Name: ${payload.name}`,
    `Sender Email: ${payload.email}`,
    `Submitted At (UTC): ${submittedIso}`,
    '------------------------------------------------------------',
    '',
    payload.message,
    '',
    '------------------------------------------------------------',
    'Sent via synOUT Contact Form (Reply-To set to sender email).',
  ].join('\n');
}

function buildRfc2822Base64UrlEmail(params: {
  to: string;
  replyTo: string;
  subject: string;
  bodyText: string;
}): string {
  const safeReplyTo = stripHeaderControlChars(params.replyTo);
  const lines = [
    `To: ${params.to}`,
    `Reply-To: ${safeReplyTo}`,
    `Subject: ${params.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    params.bodyText,
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function inspectConfiguredOperatorEmailProvider(): {
  operatorProviderConfigured: boolean;
  providerKind: 'resend_api' | 'sendgrid_api' | 'operator_smtp' | 'none';
} {
  const resendKey = (process.env.CONTACT_RESEND_API_KEY || process.env.RESEND_API_KEY || '').trim();
  if (resendKey) {
    return { operatorProviderConfigured: true, providerKind: 'resend_api' };
  }

  const sendgridKey = (
    process.env.CONTACT_SENDGRID_API_KEY ||
    process.env.SENDGRID_API_KEY ||
    ''
  ).trim();
  const sendgridFrom = (process.env.CONTACT_FROM_EMAIL || process.env.SMTP_FROM || '').trim();
  if (sendgridKey && sendgridFrom) {
    return { operatorProviderConfigured: true, providerKind: 'sendgrid_api' };
  }

  const smtpHost = (process.env.CONTACT_SMTP_HOST || process.env.SMTP_HOST || '').trim();
  const smtpUser = (process.env.CONTACT_SMTP_USER || process.env.SMTP_USER || '').trim();
  const smtpPass = (process.env.CONTACT_SMTP_PASS || process.env.SMTP_PASS || '').trim();
  if (smtpHost && smtpUser && smtpPass) {
    return { operatorProviderConfigured: true, providerKind: 'operator_smtp' };
  }

  return { operatorProviderConfigured: false, providerKind: 'none' };
}

/**
 * Validates, rate-limits, deduplicates, and delivers a real email to
 * synovamedia@gmail.com with exact subject "synOUT MESSAGE".
 * Never fabricates delivery or exposes server secrets/stack traces.
 */
export async function processAndDeliverContactSubmission(
  input: ContactSubmissionInput,
  clientRateKey: string,
  context: ContactDeliveryContext = {}
): Promise<ContactDeliveryResult> {
  const validation = validateContactSubmission(input);
  if (!validation.valid || !validation.payload) {
    return {
      success: false,
      httpStatus: 400,
      accepted: false,
      errorCode: 'VALIDATION_FAILED',
      userMessage: 'Please review the highlighted fields and try again.',
      errors: validation.errors,
    };
  }

  const payload = validation.payload;

  if (isDuplicateContactFingerprint(payload.fingerprintSha256)) {
    return {
      success: false,
      httpStatus: 409,
      accepted: false,
      errorCode: 'DUPLICATE_SUBMISSION',
      userMessage:
        'This exact message was already submitted recently. Please wait a few minutes if you need to send an update.',
    };
  }

  const rateCheck = checkContactRateLimit(clientRateKey);
  if (!rateCheck.allowed) {
    return {
      success: false,
      httpStatus: 429,
      accepted: false,
      errorCode: 'RATE_LIMITED',
      userMessage:
        'Too many contact attempts from this session. Please wait a few minutes and try again.',
    };
  }

  const submittedIso = new Date().toISOString();
  const bodyText = formatContactPlainTextBody(payload, submittedIso);

  // 1. Deterministic test transport hook (for unit/integration tests without live credentials)
  if (context.customTransporterForTests) {
    try {
      const info = await context.customTransporterForTests.sendMail({
        from: `"synOUT Contact" <noreply@synout.local>`,
        replyTo: payload.email,
        to: OPERATOR_CONTACT_RECIPIENT,
        subject: OPERATOR_CONTACT_SUBJECT,
        text: bodyText,
      });
      const acceptedList = Array.isArray(info.accepted) ? info.accepted.map(String) : [];
      if (acceptedList.length === 0 && Array.isArray(info.rejected) && info.rejected.length > 0) {
        return {
          success: false,
          httpStatus: 502,
          accepted: false,
          errorCode: 'DELIVERY_FAILED',
          userMessage: 'Your message could not be sent right now. Please try again.',
        };
      }
      recordContactFingerprint(payload.fingerprintSha256);
      return {
        success: true,
        httpStatus: 200,
        accepted: true,
        provider: 'test_transport',
        messageId: info.messageId || `<contact-${Date.now()}@synout>`,
        userMessage: 'Message sent successfully!',
      };
    } catch {
      return {
        success: false,
        httpStatus: 502,
        accepted: false,
        errorCode: 'DELIVERY_FAILED',
        userMessage: 'Your message could not be sent right now. Please try again.',
      };
    }
  }

  // 2. Resend Transactional API (if configured via server secret)
  const resendKey = (process.env.CONTACT_RESEND_API_KEY || process.env.RESEND_API_KEY || '').trim();
  if (resendKey) {
    const fromEmail =
      (process.env.CONTACT_FROM_EMAIL || '').trim() || 'synOUT Contact <onboarding@resend.dev>';
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [OPERATOR_CONTACT_RECIPIENT],
          reply_to: payload.email,
          subject: OPERATOR_CONTACT_SUBJECT,
          text: bodyText,
        }),
      });
      const data = (await res.json().catch(() => null)) as { id?: string } | null;
      if (res.ok && data?.id) {
        recordContactFingerprint(payload.fingerprintSha256);
        return {
          success: true,
          httpStatus: 200,
          accepted: true,
          provider: 'resend_api',
          messageId: data.id,
          userMessage: 'Message sent successfully!',
        };
      }
      return {
        success: false,
        httpStatus: 502,
        accepted: false,
        errorCode: 'DELIVERY_FAILED',
        userMessage: 'The email delivery service could not send your message. Please try again.',
      };
    } catch {
      return {
        success: false,
        httpStatus: 502,
        accepted: false,
        errorCode: 'DELIVERY_FAILED',
        userMessage: 'The email delivery service could not be reached. Please try again.',
      };
    }
  }

  // 3. SendGrid Transactional API (if configured via server secret)
  const sendgridKey = (
    process.env.CONTACT_SENDGRID_API_KEY ||
    process.env.SENDGRID_API_KEY ||
    ''
  ).trim();
  const configuredFrom = (process.env.CONTACT_FROM_EMAIL || process.env.SMTP_FROM || '').trim();
  if (sendgridKey && configuredFrom) {
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sendgridKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: OPERATOR_CONTACT_RECIPIENT }] }],
          from: { email: configuredFrom, name: 'synOUT Contact' },
          reply_to: { email: payload.email, name: payload.name },
          subject: OPERATOR_CONTACT_SUBJECT,
          content: [{ type: 'text/plain', value: bodyText }],
        }),
      });
      if (res.ok || res.status === 202) {
        const msgId = res.headers.get('x-message-id') || `sg-${Date.now()}`;
        recordContactFingerprint(payload.fingerprintSha256);
        return {
          success: true,
          httpStatus: 200,
          accepted: true,
          provider: 'sendgrid_api',
          messageId: msgId,
          userMessage: 'Message sent successfully!',
        };
      }
      return {
        success: false,
        httpStatus: 502,
        accepted: false,
        errorCode: 'DELIVERY_FAILED',
        userMessage: 'The email delivery service could not send your message. Please try again.',
      };
    } catch {
      return {
        success: false,
        httpStatus: 502,
        accepted: false,
        errorCode: 'DELIVERY_FAILED',
        userMessage: 'The email delivery service could not be reached. Please try again.',
      };
    }
  }

  // 4. Operator Nodemailer SMTP Configuration
  const smtpHost = (process.env.CONTACT_SMTP_HOST || process.env.SMTP_HOST || '').trim();
  const smtpUser = (process.env.CONTACT_SMTP_USER || process.env.SMTP_USER || '').trim();
  const smtpPass = (process.env.CONTACT_SMTP_PASS || process.env.SMTP_PASS || '').trim();
  if (smtpHost && smtpUser && smtpPass) {
    const smtpPort = parseInt(
      (process.env.CONTACT_SMTP_PORT || process.env.SMTP_PORT || '465').trim(),
      10
    );
    const smtpSecure =
      process.env.CONTACT_SMTP_SECURE !== undefined
        ? process.env.CONTACT_SMTP_SECURE === 'true'
        : smtpPort === 465;
    const fromHeader = configuredFrom || `"synOUT Contact" <${smtpUser}>`;

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number.isNaN(smtpPort) ? 465 : smtpPort,
        secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass },
        connectionTimeout: 12000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });

      const info = await transporter.sendMail({
        from: fromHeader,
        replyTo: `"${payload.name.replace(/["<>]/g, '')}" <${payload.email}>`,
        to: OPERATOR_CONTACT_RECIPIENT,
        subject: OPERATOR_CONTACT_SUBJECT,
        text: bodyText,
      });

      const accepted = Array.isArray(info.accepted) ? info.accepted.map(String) : [];
      if (accepted.length === 0) {
        return {
          success: false,
          httpStatus: 502,
          accepted: false,
          errorCode: 'DELIVERY_FAILED',
          userMessage: 'The mail server did not accept the message for delivery. Please try again.',
        };
      }

      recordContactFingerprint(payload.fingerprintSha256);
      return {
        success: true,
        httpStatus: 200,
        accepted: true,
        provider: 'operator_smtp',
        messageId: info.messageId || `<smtp-${Date.now()}@synout>`,
        userMessage: 'Message sent successfully!',
      };
    } catch {
      return {
        success: false,
        httpStatus: 502,
        accepted: false,
        errorCode: 'DELIVERY_FAILED',
        userMessage: 'Your message could not be sent via SMTP right now. Please try again.',
      };
    }
  }

  // 5. Connected User Session SMTP Vault (when user already connected SMTP in synOUT)
  if (context.sessionSmtp) {
    try {
      const transporter = nodemailer.createTransport({
        host: context.sessionSmtp.resolvedHost,
        port: context.sessionSmtp.resolvedPort,
        secure: context.sessionSmtp.resolvedSecure,
        auth: {
          user: context.sessionSmtp.userEmail,
          pass: context.sessionSmtp.normalizedAuthPass,
        },
        connectionTimeout: 12000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });

      const info = await transporter.sendMail({
        from: `"${payload.name.replace(/["<>]/g, '')}" <${context.sessionSmtp.userEmail}>`,
        replyTo: payload.email,
        to: OPERATOR_CONTACT_RECIPIENT,
        subject: OPERATOR_CONTACT_SUBJECT,
        text: bodyText,
      });

      const accepted = Array.isArray(info.accepted) ? info.accepted.map(String) : [];
      if (accepted.length > 0) {
        recordContactFingerprint(payload.fingerprintSha256);
        return {
          success: true,
          httpStatus: 200,
          accepted: true,
          provider: 'session_smtp',
          messageId: info.messageId || `<session-smtp-${Date.now()}@synout>`,
          userMessage: 'Message sent successfully!',
        };
      }
    } catch {
      return {
        success: false,
        httpStatus: 502,
        accepted: false,
        errorCode: 'DELIVERY_FAILED',
        userMessage:
          'Your message could not be delivered through the connected SMTP session. Please check your connection and try again.',
      };
    }
  }

  // 6. Connected User Google OAuth Bearer Token (gmail.send)
  if (context.oauthBearerToken) {
    try {
      const rawRfc2822 = buildRfc2822Base64UrlEmail({
        to: OPERATOR_CONTACT_RECIPIENT,
        replyTo: payload.email,
        subject: OPERATOR_CONTACT_SUBJECT,
        bodyText,
      });

      const res = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${context.oauthBearerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: rawRfc2822 }),
        }
      );
      const data = (await res.json().catch(() => null)) as { id?: string } | null;
      if (res.ok && data?.id) {
        recordContactFingerprint(payload.fingerprintSha256);
        return {
          success: true,
          httpStatus: 200,
          accepted: true,
          provider: 'gmail_oauth',
          messageId: data.id,
          userMessage: 'Message sent successfully!',
        };
      }

      return {
        success: false,
        httpStatus: 502,
        accepted: false,
        errorCode: 'DELIVERY_FAILED',
        userMessage:
          'Google Gmail API did not accept the message. Reconnect your Google account or try again.',
      };
    } catch {
      return {
        success: false,
        httpStatus: 502,
        accepted: false,
        errorCode: 'DELIVERY_FAILED',
        userMessage: 'Unable to reach Gmail delivery service right now. Please try again.',
      };
    }
  }

  // 7. Honest Unconfigured Provider Response (Zero Fabricated Delivery!)
  return {
    success: false,
    httpStatus: 503,
    accepted: false,
    errorCode: 'EMAIL_PROVIDER_NOT_CONFIGURED',
    userMessage:
      'Automatic contact email delivery could not be initiated because no server email provider is currently configured and no direct-send account (Google OAuth or SMTP App Password) is active in this session. Your message has been preserved below so you can connect a direct-send email account or retry once server delivery credentials are configured.',
  };
}
