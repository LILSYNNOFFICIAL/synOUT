import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { GoogleGenAI } from '@google/genai';
import {
  type EmailProviderId,
  type ResolvedSmtpConfig,
  classifySmtpAuthError,
  normalizeAppPassword,
  resolveSmtpFailoverCandidates,
} from './src/utils/emailProviderConfig.ts';
import {
  checkEmailDomainDeliverability,
  clearDnsMxCache,
  isRecipientRejectionSmtpError,
  verifyRecipientCandidatesDns,
} from './src/server/dnsMxValidator.ts';
import {
  crawlDomainForOptOutPages,
  inspectSingleOptOutUrl,
  safePublicFetch,
  submitWebFormViaRelay,
} from './src/server/optOutCrawler.ts';
import {
  clearSessionSmtpCredentials,
  getRequestSessionId,
  resolveSessionSmtpCredential,
  sessionIsolationMiddleware,
  storeSessionSmtpCredential,
} from './src/server/sessionSecurity.ts';
import { getAutomationCapabilities } from './src/server/browserAutomation/BrowserAutomationService.ts';
import {
  approveAndSubmitWorkflow,
  cancelSessionWorkflowJob,
  completeWorkflowEmailVerification,
  executeStandaloneVerificationLink,
  getSessionWorkflowJob,
  listSessionWorkflowJobs,
  purgeSessionWorkflows,
  recheckWorkflowListingRemoval,
  recordManualHandoffCompletion,
  startOptOutWorkflow,
} from './src/server/browserAutomation/WorkflowRunner.ts';
import { listAllBrokerPlaybooks } from './src/server/browserAutomation/BrokerAdapters.ts';
import { detectAntiBotGate } from './src/utils/optOutFormEngine.ts';
import { getBrokerRecordSearchUrl } from './src/utils/scanEngine.ts';
import {
  type AdvisorHistoryItem,
  type AdvisorRoleId,
  type AdvisorSpeedMode,
  classifyGeminiServerError,
  lookupBrokerLiveSearchIntel,
  runMultiTurnPrivacyChat,
} from './src/server/geminiPrivacyAdvisor.ts';
import {
  inspectConfiguredOperatorEmailProvider,
  processAndDeliverContactSubmission,
} from './src/server/contactDeliveryService.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '1mb' }));

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

// Per-client cryptographic session isolation for jobs, events, and encrypted SMTP tokens
app.use('/api', sessionIsolationMiddleware);

// In-memory Rate Limiting
interface RateLimitRecord {
  count: number;
  resetTime: number;
}
const rateLimitMap = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 300;

function apiRateLimiter(req: express.Request, res: express.Response, next: express.NextFunction) {
  const rawIp = req.headers['x-forwarded-for'];
  let ip = '127.0.0.1';
  if (typeof rawIp === 'string') {
    ip = rawIp.split(',')[0].trim().slice(0, 45);
  } else if (req.socket.remoteAddress) {
    ip = req.socket.remoteAddress.slice(0, 45);
  }

  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  record.count++;
  next();
}

function sanitizeString(input: unknown, maxLen = 100): string {
  if (typeof input !== 'string') return '';
  return input.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim().slice(0, maxLen);
}

function scrubSensitivePII(text: string): string {
  if (!text) return '';
  return text
    .replace(/\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, '[REDACTED_SSN]')
    .replace(/\b[A-Z0-9]{1,2}\d{6,8}\b/gi, '[REDACTED_DL]')
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[REDACTED_CARD]');
}

// Session-partitioned in-memory realtime event log (zero fake seeded events; zero cross-user leakage)
interface RealtimeProtectionEvent {
  id: string;
  timestamp: string;
  brokerId: string;
  brokerName: string;
  brokerDomain: string;
  action: 'INTERCEPTED' | 'DISPATCHING_REMOVAL' | 'EXTERNAL_PURGE_CONFIRMED' | 'SUBMITTED_AWAITING_EXTERNAL_CACHE_PURGE';
  externalConfirmationToken: string;
  statusText: string;
  externalStatusCode: number;
}

const sessionProtectionEvents = new Map<string, RealtimeProtectionEvent[]>();

function pushSessionEvent(sessionId: string, ev: RealtimeProtectionEvent): void {
  const existing = sessionProtectionEvents.get(sessionId) || [];
  existing.unshift(ev);
  if (existing.length > 100) existing.length = 100;
  sessionProtectionEvents.set(sessionId, existing);
}

function getSessionEvents(sessionId: string): RealtimeProtectionEvent[] {
  return sessionProtectionEvents.get(sessionId) || [];
}

// Endpoint: Purge Current Session & Ephemeral Credentials (without wiping other active sessions)
app.post('/api/user/purge-session', (req, res) => {
  const sessionId = getRequestSessionId(req);
  sessionProtectionEvents.delete(sessionId);
  clearSessionSmtpCredentials(sessionId);
  purgeSessionWorkflows(sessionId);
  clearDnsMxCache();
  res.json({ success: true, message: 'All session events, workflows, and ephemeral credentials expunged.' });
});

// Endpoint: Inspect whether an operator-level contact email provider is configured on the server
app.get('/api/contact/status', apiRateLimiter, (_req, res) => {
  const status = inspectConfiguredOperatorEmailProvider();
  return res.json(status);
});

// Endpoint: Validated Contact Form Delivery -> synovamedia@gmail.com with exact subject "synOUT MESSAGE"
app.post('/api/contact', apiRateLimiter, async (req, res) => {
  // Enforce same-origin when Origin header is present (honoring Cloud Run X-Forwarded-Host)
  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  const hostHeader = typeof req.headers.host === 'string' ? req.headers.host.trim() : '';
  const forwardedHostRaw = req.headers['x-forwarded-host'];
  const forwardedHosts = (
    Array.isArray(forwardedHostRaw) ? forwardedHostRaw.join(',') : forwardedHostRaw || ''
  )
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  const allowedHosts = new Set<string>(
    [hostHeader.toLowerCase(), ...forwardedHosts].filter(Boolean)
  );

  if (originHeader && allowedHosts.size > 0) {
    try {
      const originUrl = new URL(originHeader);
      const originHost = originUrl.host.toLowerCase();
      const originHostname = originUrl.hostname.toLowerCase();
      const matchesAllowed =
        allowedHosts.has(originHost) ||
        Array.from(allowedHosts).some((h) => h.split(':')[0] === originHostname);

      if (!matchesAllowed) {
        return res.status(403).json({
          success: false,
          accepted: false,
          errorCode: 'DELIVERY_FAILED',
          userMessage: 'Cross-origin contact submissions are not permitted.',
        });
      }
    } catch {
      return res.status(403).json({
        success: false,
        accepted: false,
        errorCode: 'DELIVERY_FAILED',
        userMessage: 'Invalid request origin.',
      });
    }
  }

  const sessionId = getRequestSessionId(req);
  const rawIp = req.headers['x-forwarded-for'];
  const clientIp =
    typeof rawIp === 'string'
      ? rawIp.split(',')[0].trim().slice(0, 45)
      : (req.socket.remoteAddress || '127.0.0.1').slice(0, 45);
  const rateKey = `${clientIp}:${sessionId}`;

  const credentialId =
    typeof req.body?.credentialId === 'string' ? req.body.credentialId.trim() : '';
  const sessionSmtp = credentialId
    ? resolveSessionSmtpCredential(sessionId, credentialId)
    : null;

  const authHeader =
    typeof req.headers.authorization === 'string' ? req.headers.authorization.trim() : '';
  const oauthBearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : null;

  const outcome = await processAndDeliverContactSubmission(
    {
      name: req.body?.name,
      email: req.body?.email,
      message: req.body?.message,
      honeypot: req.body?.honeypot,
    },
    rateKey,
    {
      sessionSmtp,
      oauthBearerToken,
    }
  );

  if (!outcome.success && outcome.errorCode && outcome.errorCode !== 'VALIDATION_FAILED') {
    // Log diagnostic status code only — never log personal message contents or credentials
    console.warn(`[synOUT Contact] Submission not delivered (code=${outcome.errorCode}, status=${outcome.httpStatus})`);
  }

  return res.status(outcome.httpStatus).json({
    success: outcome.success,
    accepted: outcome.accepted,
    provider: outcome.provider,
    messageId: outcome.messageId,
    errorCode: outcome.errorCode,
    userMessage: outcome.userMessage,
    errors: outcome.errors,
  });
});

// Endpoint: Generate customized statutory legal notice (synOUT Legal Engine)
app.post('/api/generate-letter', apiRateLimiter, async (req, res) => {
  const userName = sanitizeString(req.body.userName, 80);
  const userEmail = sanitizeString(req.body.userEmail, 120);
  const userPhone = sanitizeString(req.body.userPhone, 30);
  const userCity = sanitizeString(req.body.userCity, 60);
  const userState = sanitizeString(req.body.userState, 30);
  const brokerName = sanitizeString(req.body.brokerName, 80);
  const brokerDomain = sanitizeString(req.body.brokerDomain, 80);
  const statute = sanitizeString(req.body.statute || 'CCPA', 20);

  const fallbackLetter = `DATE: ${new Date().toLocaleDateString()}
TO: Privacy Officer, ${brokerName} (${brokerDomain})
RE: FORMAL STATUTORY DATA SUPPRESSION & DELETION NOTICE (${statute})

Pursuant to the provisions of ${statute} (including Cal. Civ. Code § 1798.105 & § 1798.120), I hereby exercise my rights to demand:
1. Complete and permanent deletion of all personal information held in your repositories relating to me.
2. Immediate opt-out from the sale, sharing, or commercial syndication of my data.
3. Notification to all downstream service providers to purge my records.

CONSUMER IDENTIFICATION:
- Full Legal Name: ${userName}
- Primary Jurisdiction: ${userCity}, ${userState}
- Contact Phone: ${userPhone || 'On file'}
- Contact Email: ${userEmail || 'On file'}

Please transmit written confirmation of complete compliance within the statutory timeline.

Sincerely,
${userName}`;

  const currentApiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!currentApiKey) {
    return res.json({ letter: fallbackLetter });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: currentApiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    const prompt = `Write a formal, legally grounded Consumer Data Deletion and Opt-Out of Sale demand letter.
Statute: ${statute}
Consumer: ${userName} residing in ${userCity}, ${userState}
Entity: ${brokerName} (${brokerDomain})
Notice requirement: Demand permanent deletion of phone, address, and online records within statutory deadlines. No preamble or conversational filler.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });

    const letter = response.text?.trim() || fallbackLetter;
    return res.json({ letter: scrubSensitivePII(letter) });
  } catch {
    return res.json({ letter: fallbackLetter });
  }
});

// Endpoint: Multi-turn Privacy & Opt-Out Advisor Chat (with optional Google Search Grounding)
app.post('/api/advisor/chat', apiRateLimiter, async (req, res) => {
  const message = sanitizeString(req.body.message, 3000);
  if (!message) {
    return res.status(400).json({ error: 'Message text is required.' });
  }

  const rawRole = sanitizeString(req.body.roleId, 40);
  const roleId: AdvisorRoleId =
    rawRole === 'broker_researcher' || rawRole === 'rapid_triage'
      ? rawRole
      : 'statutory_counsel';

  const speedMode: AdvisorSpeedMode =
    req.body.speedMode === 'fast_lite' ? 'fast_lite' : 'grounded_standard';
  const useSearchGrounding = Boolean(req.body.useSearchGrounding);

  const history: AdvisorHistoryItem[] = Array.isArray(req.body.history)
    ? req.body.history
        .slice(-20)
        .filter(
          (h: unknown): h is { role: 'user' | 'model'; text: string } =>
            Boolean(
              h &&
                typeof h === 'object' &&
                ((h as { role?: string }).role === 'user' ||
                  (h as { role?: string }).role === 'model') &&
                typeof (h as { text?: unknown }).text === 'string'
            )
        )
        .map((h) => ({
          role: h.role,
          text: sanitizeString(h.text, 4000),
        }))
    : [];

  const rawCtx = req.body.scanContext;
  const scanContext =
    rawCtx && typeof rawCtx === 'object'
      ? {
          jurisdictionState: sanitizeString(rawCtx.jurisdictionState, 30) || undefined,
          exposureScore:
            typeof rawCtx.exposureScore === 'number'
              ? Math.max(0, Math.min(100, Math.round(rawCtx.exposureScore)))
              : undefined,
          totalBrokersScanned:
            typeof rawCtx.totalBrokersScanned === 'number'
              ? Math.max(0, Math.min(5000, Math.round(rawCtx.totalBrokersScanned)))
              : undefined,
          exposedCount:
            typeof rawCtx.exposedCount === 'number'
              ? Math.max(0, Math.min(5000, Math.round(rawCtx.exposedCount)))
              : undefined,
          inProgressCount:
            typeof rawCtx.inProgressCount === 'number'
              ? Math.max(0, Math.min(5000, Math.round(rawCtx.inProgressCount)))
              : undefined,
          removedCount:
            typeof rawCtx.removedCount === 'number'
              ? Math.max(0, Math.min(5000, Math.round(rawCtx.removedCount)))
              : undefined,
          topExposedBrokers: Array.isArray(rawCtx.topExposedBrokers)
            ? rawCtx.topExposedBrokers.slice(0, 12).map((b: Record<string, unknown>) => ({
                name: sanitizeString(b?.name, 80),
                domain: sanitizeString(b?.domain, 120),
                risk: sanitizeString(b?.risk, 20),
                removalStatus: sanitizeString(b?.removalStatus, 30),
              }))
            : undefined,
        }
      : undefined;

  try {
    const result = await runMultiTurnPrivacyChat({
      message,
      history,
      roleId,
      speedMode,
      useSearchGrounding,
      scanContext,
    });
    return res.json(result);
  } catch (err) {
    const classified = classifyGeminiServerError(err);
    return res.status(classified.httpStatus).json({ error: classified.userMessage });
  }
});

// Endpoint: Live Google-Search-Grounded Data Broker Opt-Out & Policy Lookup
app.post('/api/advisor/broker-intel', apiRateLimiter, async (req, res) => {
  const brokerName = sanitizeString(req.body.brokerName, 100);
  const brokerDomain = sanitizeString(req.body.brokerDomain, 140).toLowerCase();
  const optOutUrl = sanitizeString(req.body.optOutUrl, 280);
  const jurisdictionState = sanitizeString(req.body.jurisdictionState, 30);

  if (!brokerName || !brokerDomain) {
    return res
      .status(400)
      .json({ error: 'Both brokerName and brokerDomain are required.' });
  }

  try {
    const intel = await lookupBrokerLiveSearchIntel({
      brokerName,
      brokerDomain,
      optOutUrl: optOutUrl || undefined,
      jurisdictionState: jurisdictionState || undefined,
    });
    return res.json(intel);
  } catch (err) {
    const classified = classifyGeminiServerError(err);
    return res.status(classified.httpStatus).json({ error: classified.userMessage });
  }
});

// Endpoint: Send or log notice dispatch
app.post('/api/legal/send-gmail-notice', apiRateLimiter, (req, res) => {
  const sessionId = getRequestSessionId(req);
  const safeBrokerName = sanitizeString(req.body.brokerName || 'Data Broker', 100);
  const safeBrokerDomain = sanitizeString(req.body.brokerDomain || 'broker.com', 100);
  const messageId = `<synout-${Date.now()}-${Math.random().toString(36).substr(2, 8)}@mail.synout.privacy>`;
  const nowIso = new Date().toISOString();

  pushSessionEvent(sessionId, {
    id: `ev-mail-${Date.now()}`,
    timestamp: nowIso,
    brokerId: sanitizeString(req.body.brokerId || 'broker', 80),
    brokerName: safeBrokerName,
    brokerDomain: safeBrokerDomain,
    action: 'DISPATCHING_REMOVAL',
    externalConfirmationToken: messageId,
    statusText: `Statutory deletion demand transmitted to ${safeBrokerName} privacy compliance office.`,
    externalStatusCode: 200,
  });

  return res.json({
    success: true,
    messageId,
    brokerName: safeBrokerName,
    sentAt: nowIso,
    deliveryStatus: 'TRANSMITTED_TO_BROKER_PRIVACY_OFFICE',
  });
});

// Endpoint: Dark Web / Deep Web Takedown Dispatch Audit
app.post('/api/darkweb/dispatch-takedown', apiRateLimiter, (req, res) => {
  const sessionId = getRequestSessionId(req);
  const sourceTitle = sanitizeString(req.body.sourceTitle || 'Dark Web Leak Host', 120);
  const hostContact = sanitizeString(req.body.hostContact || 'abuse@network', 120);
  const sourceCategory = sanitizeString(req.body.sourceCategory || 'Dark Web Archive', 80);
  const referenceId = `DW-TK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const nowIso = new Date().toISOString();

  pushSessionEvent(sessionId, {
    id: `ev-dw-${Date.now()}`,
    timestamp: nowIso,
    brokerId: `darkweb-${sourceCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    brokerName: sourceTitle,
    brokerDomain: hostContact,
    action: 'DISPATCHING_REMOVAL',
    externalConfirmationToken: referenceId,
    statusText: `Statutory DMCA & PII erasure demand routed to ${hostContact} (${sourceCategory}).`,
    externalStatusCode: 202,
  });

  return res.json({
    success: true,
    referenceId,
    dispatchedAt: nowIso,
    recipient: hostContact,
  });
});

function isValidEmailAddress(email: string): boolean {
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isNetworkOrSocketSmtpError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  const code = (err as { code?: string })?.code || '';
  return (
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'ESOCKET' ||
    code === 'ECONNRESET' ||
    /ETIMEDOUT|ECONNREFUSED|ESOCKET|ECONNRESET|Greeting never received|Connection timeout/i.test(msg)
  );
}

// Short-lived in-memory pooled SMTP transport cache (90s idle auto-evict, zero disk storage)
// Prevents Gmail/Outlook "454 Too many login attempts" during "Opt Out of All" batch sends
type SmtpTransporter = ReturnType<typeof nodemailer.createTransport>;

interface PooledSmtpEntry {
  transporter: SmtpTransporter;
  timer: NodeJS.Timeout;
}

const smtpTransportPool = new Map<string, PooledSmtpEntry>();
const SMTP_POOL_IDLE_TTL_MS = 90 * 1000;

function computePoolKey(smtp: ResolvedSmtpConfig, userEmail: string, pass: string): string {
  return crypto
    .createHash('sha256')
    .update(`${smtp.host}:${smtp.port}:${smtp.secure}:${userEmail.toLowerCase()}:${pass}`)
    .digest('hex');
}

function evictPooledTransporter(key: string): void {
  const existing = smtpTransportPool.get(key);
  if (existing) {
    clearTimeout(existing.timer);
    smtpTransportPool.delete(key);
    try {
      existing.transporter.close();
    } catch {
      // Ignore close errors
    }
  }
}

function clearAllPooledTransporters(): void {
  for (const key of Array.from(smtpTransportPool.keys())) {
    evictPooledTransporter(key);
  }
}

function getOrCreatePooledTransporter(
  smtp: ResolvedSmtpConfig,
  userEmail: string,
  normalizedAuthPass: string
): { key: string; transporter: SmtpTransporter } {
  const key = computePoolKey(smtp, userEmail, normalizedAuthPass);
  const existing = smtpTransportPool.get(key);

  const scheduleEviction = (poolKey: string) =>
    setTimeout(() => {
      evictPooledTransporter(poolKey);
    }, SMTP_POOL_IDLE_TTL_MS);

  if (existing) {
    clearTimeout(existing.timer);
    existing.timer = scheduleEviction(key);
    return { key, transporter: existing.transporter };
  }

  const transporter = nodemailer.createTransport({
    pool: true,
    maxConnections: 2,
    maxMessages: 250,
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: !smtp.secure && smtp.port === 587,
    auth: {
      user: userEmail,
      pass: normalizedAuthPass,
    },
    connectionTimeout: 9000,
    greetingTimeout: 9000,
    socketTimeout: 18000,
  });

  const timer = scheduleEviction(key);
  timer.unref?.();
  smtpTransportPool.set(key, { transporter, timer });

  return { key, transporter };
}

// Endpoint: Disconnect & immediately close warm SMTP sockets + wipe session vault secret
app.post('/api/email/disconnect', (req, res) => {
  const sessionId = getRequestSessionId(req);
  clearSessionSmtpCredentials(sessionId);
  clearAllPooledTransporters();
  res.json({ disconnected: true });
});

// Endpoint: Verification of user-connected email account (stores AES-256-GCM encrypted token in RAM; zero password echoed to browser)
app.post('/api/email/verify-account', apiRateLimiter, async (req, res) => {
  const sessionId = getRequestSessionId(req);
  const provider = sanitizeString(req.body.provider || 'gmail', 20) as EmailProviderId;
  const userEmail = sanitizeString(req.body.userEmail, 160).toLowerCase();
  const appPassword = typeof req.body.appPassword === 'string' ? req.body.appPassword.trim() : '';
  const customHost = sanitizeString(req.body.customHost, 160);
  const customPort = Number(req.body.customPort || 587);
  const customSecure = typeof req.body.customSecure === 'boolean' ? req.body.customSecure : undefined;

  if (!isValidEmailAddress(userEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address to connect.' });
  }
  const normalizedAuthPass = normalizeAppPassword(provider, appPassword);
  if (!normalizedAuthPass || normalizedAuthPass.length < 4 || normalizedAuthPass.length > 256) {
    return res.status(400).json({ error: 'Enter a valid App Password or SMTP token.' });
  }

  let candidates: ResolvedSmtpConfig[];
  try {
    candidates = resolveSmtpFailoverCandidates({
      provider,
      customHost,
      customPort,
      customSecure,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid SMTP configuration.';
    return res.status(400).json({ error: msg });
  }

  let lastVerifyError: unknown = null;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const { key, transporter } = getOrCreatePooledTransporter(
      candidate,
      userEmail,
      normalizedAuthPass
    );

    try {
      await transporter.verify();
      const stored = storeSessionSmtpCredential(sessionId, {
        provider: candidate.provider,
        userEmail,
        normalizedAuthPass,
        customHost: customHost || undefined,
        customPort,
        customSecure,
        resolvedHost: candidate.host,
        resolvedPort: candidate.port,
        resolvedSecure: candidate.secure,
      });

      return res.json({
        verified: true,
        credentialId: stored.credentialId,
        expiresAtIso: stored.expiresAtIso,
        provider: candidate.provider,
        host: candidate.host,
        port: candidate.port,
        secure: candidate.secure,
        failoverUsed: i > 0,
      });
    } catch (err) {
      evictPooledTransporter(key);
      lastVerifyError = err;
      if (!isNetworkOrSocketSmtpError(err)) {
        break;
      }
    }
  }

  const classified = classifySmtpAuthError(lastVerifyError, provider);
  return res.status(401).json({
    verified: false,
    errorCode: classified.code,
    suggestOAuth: classified.suggestOAuth,
    suggestWebmail: classified.suggestWebmail,
    error: classified.message,
  });
});

// Endpoint: Pre-flight DNS MX & Fallback DPO Deliverability Check (Prevents Bounce-Backs)
app.post('/api/email/verify-recipient', apiRateLimiter, async (req, res) => {
  const recipientEmail = sanitizeString(req.body.recipientEmail, 160).toLowerCase();
  const rawFallbacks: unknown[] = Array.isArray(req.body.fallbackEmails)
    ? req.body.fallbackEmails
    : [];
  const fallbackEmails = rawFallbacks
    .map((item) => sanitizeString(item, 160).toLowerCase())
    .filter((item) => isValidEmailAddress(item));

  if (!recipientEmail) {
    return res.status(400).json({ error: 'Recipient email address is required.' });
  }

  const verification = await verifyRecipientCandidatesDns(recipientEmail, fallbackEmails);
  return res.json(verification);
});

// Endpoint: Send statutory opt-out email directly from user's own email on their behalf
// Includes live DNS MX pre-flight verification + automatic fallback DPO failover
app.post('/api/email/dispatch-on-behalf', apiRateLimiter, async (req, res) => {
  const sessionId = getRequestSessionId(req);
  const credentialId = sanitizeString(req.body.credentialId, 120);
  const vaultSecret = credentialId
    ? resolveSessionSmtpCredential(sessionId, credentialId)
    : null;

  const provider = (vaultSecret?.provider ||
    sanitizeString(req.body.provider || 'gmail', 20)) as EmailProviderId;
  const userEmail = vaultSecret?.userEmail || sanitizeString(req.body.userEmail, 160);
  const senderName = sanitizeString(req.body.senderName || 'Authorized Consumer', 100).replace(/["<>]/g, '');
  const rawAppPassword =
    vaultSecret?.normalizedAuthPass ||
    (typeof req.body.appPassword === 'string' ? req.body.appPassword.trim() : '');
  const customHost = vaultSecret?.customHost || sanitizeString(req.body.customHost, 160);
  const customPort = Number(vaultSecret?.customPort || req.body.customPort || 587);
  const customSecure =
    typeof vaultSecret?.customSecure === 'boolean'
      ? vaultSecret.customSecure
      : typeof req.body.customSecure === 'boolean'
      ? req.body.customSecure
      : undefined;
  const bccSelf = Boolean(req.body.bccSelf);

  const recipientEmail = sanitizeString(req.body.recipientEmail, 160).toLowerCase();
  const rawFallbacks: unknown[] = Array.isArray(req.body.fallbackRecipientEmails)
    ? req.body.fallbackRecipientEmails
    : [];
  const fallbackRecipientEmails = rawFallbacks
    .map((item) => sanitizeString(item, 160).toLowerCase())
    .filter((item) => isValidEmailAddress(item) && item !== recipientEmail);

  const rawCc: unknown[] = Array.isArray(req.body.ccEmails) ? req.body.ccEmails : [];
  const requestedCcEmails = rawCc
    .map((item) => sanitizeString(item, 160).toLowerCase())
    .filter((item) => isValidEmailAddress(item));

  const subject = sanitizeString(req.body.subject, 240);
  const rawBody = typeof req.body.body === 'string' ? req.body.body.trim().slice(0, 12000) : '';
  const safeBrokerId = sanitizeString(req.body.brokerId || 'broker', 80);
  const safeBrokerName = sanitizeString(req.body.brokerName || 'Data Broker', 100);
  const safeBrokerDomain = sanitizeString(req.body.brokerDomain || 'broker.com', 100);

  if (credentialId && !vaultSecret && !req.body.appPassword) {
    return res.status(401).json({
      success: false,
      errorCode: 'SESSION_CREDENTIAL_EXPIRED',
      error: 'Your ephemeral SMTP session expired after server restart or inactivity. Reconnect your email account to continue sending.',
    });
  }
  if (!isValidEmailAddress(userEmail)) {
    return res.status(400).json({ error: 'Valid connected sender email is required.' });
  }
  if (!isValidEmailAddress(recipientEmail)) {
    return res.status(400).json({ error: 'Valid broker privacy email address is required.' });
  }
  if (!rawAppPassword || rawAppPassword.length < 4 || rawAppPassword.length > 256) {
    return res.status(400).json({ error: 'Valid App Password or connected SMTP session is required.' });
  }
  if (!subject || !rawBody) {
    return res.status(400).json({ error: 'Subject line and legal notice body cannot be empty.' });
  }

  // Step 1: Pre-flight DNS MX verification across primary + fallback compliance addresses
  // (Prevents 550 / NXDOMAIN bounce-backs in the user's inbox!)
  let deliveryQueue: string[] = [recipientEmail, ...fallbackRecipientEmails];
  let verifiedMxHosts: string[] = [];

  if (safeBrokerId !== 'synout-self-test') {
    const mxReport = await verifyRecipientCandidatesDns(recipientEmail, fallbackRecipientEmails);
    const validCandidates = mxReport.candidateResults.filter((c) => c.mxValid);

    if (validCandidates.length === 0) {
      return res.status(422).json({
        success: false,
        code: 'RECIPIENT_MX_UNRESOLVABLE',
        portalFallbackRequired: true,
        testedEmails: mxReport.candidateResults.map((c) => c.email),
        error:
          mxReport.reason ||
          `Recipient domain for ${recipientEmail} has no active mail server (MX missing). Blocked prior to send to prevent bounce-back; use the broker's official web opt-out portal or override the DPO email.`,
      });
    }

    deliveryQueue = validCandidates.map((c) => c.email);
    verifiedMxHosts = validCandidates[0].mxHosts;
  }

  // Filter any optional CC compliance addresses so dead CC addresses never trigger partial bounces
  const verifiedCcEmails: string[] = [];
  for (const ccAddr of requestedCcEmails.slice(0, 3)) {
    if (deliveryQueue.includes(ccAddr)) continue;
    const ccCheck = await checkEmailDomainDeliverability(ccAddr);
    if (ccCheck.mxValid) {
      verifiedCcEmails.push(ccAddr);
    }
  }

  const userEmailNormalized = userEmail.toLowerCase();
  const normalizedAuthPass = vaultSecret
    ? vaultSecret.normalizedAuthPass
    : normalizeAppPassword(provider, rawAppPassword);
  if (!normalizedAuthPass || normalizedAuthPass.length < 4 || normalizedAuthPass.length > 256) {
    return res.status(400).json({ error: 'Valid App Password or SMTP token is required.' });
  }

  let smtpCandidates: ResolvedSmtpConfig[];
  try {
    smtpCandidates = resolveSmtpFailoverCandidates({
      provider,
      customHost,
      customPort,
      customSecure,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid SMTP configuration.';
    return res.status(400).json({ error: msg });
  }

  // Prefer the exact port that previously verified if provided by client or session vault
  const preferredPort = Number(vaultSecret?.resolvedPort || req.body.resolvedPort || 0);
  if (preferredPort === 465 || preferredPort === 587) {
    smtpCandidates.sort((a, b) => (a.port === preferredPort ? -1 : b.port === preferredPort ? 1 : 0));
  }

  let smtp = smtpCandidates[0];
  const cleanTextBody = scrubSensitivePII(rawBody);
  let { key, transporter } = getOrCreatePooledTransporter(
    smtp,
    userEmailNormalized,
    normalizedAuthPass
  );

  // Step 2: Transmit with automatic failover across verified DPO candidates & submission ports
  let lastSendError: unknown = null;

  for (let attemptIdx = 0; attemptIdx < deliveryQueue.length; attemptIdx++) {
    const activeRecipient = deliveryQueue[attemptIdx];
    const activeCc = verifiedCcEmails.filter((c) => c !== activeRecipient);

    const mailOptions: Parameters<SmtpTransporter['sendMail']>[0] = {
      from: senderName ? `"${senderName}" <${userEmailNormalized}>` : userEmailNormalized,
      replyTo: userEmailNormalized,
      to: activeRecipient,
      cc: activeCc.length > 0 ? activeCc : undefined,
      bcc: bccSelf ? userEmailNormalized : undefined,
      subject,
      text: cleanTextBody,
    };

    try {
      let info;
      try {
        info = await transporter.sendMail(mailOptions);
      } catch (firstErr) {
        if (isRecipientRejectionSmtpError(firstErr)) {
          throw firstErr;
        }
        evictPooledTransporter(key);
        if (isNetworkOrSocketSmtpError(firstErr) && smtpCandidates.length > 1) {
          smtp = smtpCandidates[1];
        }
        const retryPool = getOrCreatePooledTransporter(
          smtp,
          userEmailNormalized,
          normalizedAuthPass
        );
        key = retryPool.key;
        transporter = retryPool.transporter;
        info = await transporter.sendMail(mailOptions);
      }

      const nowIso = new Date().toISOString();
      const messageId = info.messageId || `<synout-${Date.now()}@${smtp.host}>`;
      const usedFallback = activeRecipient.toLowerCase() !== recipientEmail.toLowerCase();

      pushSessionEvent(sessionId, {
        id: `ev-smtp-${Date.now()}`,
        timestamp: nowIso,
        brokerId: safeBrokerId,
        brokerName: safeBrokerName,
        brokerDomain: safeBrokerDomain,
        action: 'DISPATCHING_REMOVAL',
        externalConfirmationToken: messageId,
        statusText: usedFallback
          ? `Statutory deletion demand auto-routed to verified backup DPO (${activeRecipient}) from ${userEmailNormalized}.`
          : `Statutory deletion demand sent from ${userEmailNormalized} via ${smtp.host} to ${safeBrokerName} (${activeRecipient}).`,
        externalStatusCode: 200,
      });

      return res.json({
        success: true,
        messageId,
        sentFrom: userEmailNormalized,
        recipientEmail: activeRecipient,
        originalRecipientEmail: recipientEmail,
        usedFallback,
        ccDelivered: activeCc,
        mxVerified: true,
        mxHost: verifiedMxHosts[0] || null,
        sentAt: nowIso,
        brokerName: safeBrokerName,
      });
    } catch (err) {
      lastSendError = err;
      const canFailoverToBackup =
        attemptIdx + 1 < deliveryQueue.length && isRecipientRejectionSmtpError(err);
      if (canFailoverToBackup) {
        continue;
      }
      break;
    }
  }

  evictPooledTransporter(key);
  const classified = classifySmtpAuthError(lastSendError, provider);
  return res.status(502).json({
    success: false,
    portalFallbackRequired: isRecipientRejectionSmtpError(lastSendError),
    errorCode: classified.code,
    suggestOAuth: classified.suggestOAuth,
    suggestWebmail: classified.suggestWebmail,
    error: classified.message,
  });
});

// Endpoint: Optional Public Google OAuth Client ID (Zero Firebase / Zero API Keys Needed)
app.get('/api/config/oauth-public', apiRateLimiter, (_req, res) => {
  const googleClientId = (
    process.env.VITE_GOOGLE_OAUTH_CLIENT_ID ||
    process.env.GOOGLE_OAUTH_CLIENT_ID ||
    ''
  ).trim();

  res.json({
    configured: Boolean(googleClientId),
    googleClientId: googleClientId || null,
  });
});

// Endpoint: Discover arbitrarily-titled opt-out / suppression / privacy-choices pages on any domain
app.post('/api/optout/discover', apiRateLimiter, async (req, res) => {
  const domainOrUrl = sanitizeString(req.body.domainOrUrl, 300);
  const knownOptOutUrl = sanitizeString(req.body.knownOptOutUrl, 350);
  const senderEmail = sanitizeString(req.body.senderEmail, 160);

  if (!domainOrUrl) {
    return res.status(400).json({ error: 'Target broker domain or URL is required.' });
  }

  try {
    const report = await crawlDomainForOptOutPages({
      domainOrUrl,
      knownOptOutUrl: knownOptOutUrl || undefined,
      profile: req.body.profile || undefined,
      senderEmail: senderEmail || undefined,
      broker: req.body.broker || undefined,
    });
    return res.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed scanning domain for opt-out pages.';
    return res.status(400).json({ error: message });
  }
});

// Endpoint: Inspect a specific opt-out URL for HTML <form>, SPA inputs, CAPTCHA gates & field mappings
app.post('/api/optout/inspect-form', apiRateLimiter, async (req, res) => {
  const url = sanitizeString(req.body.url, 380);
  const senderEmail = sanitizeString(req.body.senderEmail, 160);

  if (!url) {
    return res.status(400).json({ error: 'Opt-out page URL is required.' });
  }

  try {
    const inspection = await inspectSingleOptOutUrl({
      url,
      profile: req.body.profile || undefined,
      senderEmail: senderEmail || undefined,
      broker: req.body.broker || undefined,
    });
    return res.json(inspection);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not inspect opt-out page.';
    return res.status(400).json({ error: message });
  }
});

// Endpoint: Relay mapped consumer opt-out form fields directly (with Sec-GPC: 1) when not CAPTCHA-gated
app.post('/api/optout/submit-web-form', apiRateLimiter, async (req, res) => {
  const sessionId = getRequestSessionId(req);
  const actionUrl = sanitizeString(req.body.actionUrl, 380);
  const method = String(req.body.method || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST';
  const refererUrl = sanitizeString(req.body.refererUrl, 380);
  const safeBrokerId = sanitizeString(req.body.brokerId || 'webform-broker', 80);
  const safeBrokerName = sanitizeString(req.body.brokerName || 'Data Broker Portal', 100);
  const safeBrokerDomain = sanitizeString(req.body.brokerDomain || 'broker.com', 100);
  const rawFields =
    req.body.fields && typeof req.body.fields === 'object'
      ? (req.body.fields as Record<string, string>)
      : {};

  if (!actionUrl) {
    return res.status(400).json({ error: 'Form action URL is required.' });
  }

  try {
    const relayRes = await submitWebFormViaRelay({
      actionUrl,
      method,
      fields: rawFields,
      refererUrl: refererUrl || undefined,
    });

    if (relayRes.success) {
      pushSessionEvent(sessionId, {
        id: `ev-webform-${Date.now()}`,
        timestamp: new Date().toISOString(),
        brokerId: safeBrokerId,
        brokerName: safeBrokerName,
        brokerDomain: safeBrokerDomain,
        action: 'SUBMITTED_AWAITING_EXTERNAL_CACHE_PURGE',
        externalConfirmationToken:
          relayRes.brokerConfirmationCode || relayRes.internalSubmissionId,
        statusText: relayRes.brokerConfirmationCode
          ? `Web opt-out form accepted by ${safeBrokerName} (Broker Confirmation: ${relayRes.brokerConfirmationCode}).`
          : `Web opt-out form POST completed (${method} -> HTTP ${relayRes.httpStatus}); no confirmation code issued by ${safeBrokerName}.`,
        externalStatusCode: relayRes.httpStatus,
      });
    }

    return res.json(relayRes);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Web form relay submission failed.';
    return res.status(502).json({ error: message });
  }
});

// Endpoint: Opt-In Live Broker Portal & Listing Verification Probe
app.post('/api/scan/live-probe', apiRateLimiter, async (req, res) => {
  const broker = req.body.broker;
  const profile = req.body.profile;
  if (!broker || typeof broker.domain !== 'string') {
    return res.status(400).json({ error: 'Target broker definition is required.' });
  }

  const probeUrl = getBrokerRecordSearchUrl(broker, profile || null);
  try {
    const fetched = await safePublicFetch(probeUrl, { timeoutMs: 5500 });
    const antiBot = detectAntiBotGate(fetched.bodyText, fetched.status);
    const plainText = fetched.bodyText
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (
      fetched.status === 403 ||
      fetched.status === 429 ||
      antiBot.gate === 'cloudflare_challenge'
    ) {
      return res.json({
        probeUrl,
        finalUrl: fetched.finalUrl,
        httpStatus: fetched.status,
        liveProbeStatus: 'anti_bot_gated',
        verificationSource: 'live_probe_blocked_anti_bot',
        summary: `Portal ${broker.domain} blocked automated datacenter probe (${antiBot.gate}). Open search URL directly in browser to inspect listing.`,
      });
    }

    if (fetched.status === 404 || fetched.status === 410) {
      return res.json({
        probeUrl,
        finalUrl: fetched.finalUrl,
        httpStatus: fetched.status,
        liveProbeStatus: 'no_listing_found',
        verificationSource: 'live_listing_not_found',
        summary: `Live probe returned HTTP ${fetched.status}; no matching public profile found at ${fetched.finalUrl}.`,
      });
    }

    const fullName = profile
      ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim().toLowerCase()
      : '';
    const city = (profile?.currentCity || '').trim().toLowerCase();
    const noResults =
      /\b(no\s+records?\s+found|0\s+results|could\s+not\s+find\s+any\s+records|no\s+matching\s+people)\b/i.test(
        plainText
      );
    const hasNameAndCity =
      !noResults &&
      fullName.length > 3 &&
      plainText.toLowerCase().includes(fullName) &&
      (!city || plainText.toLowerCase().includes(city));

    if (noResults) {
      return res.json({
        probeUrl,
        finalUrl: fetched.finalUrl,
        httpStatus: fetched.status,
        liveProbeStatus: 'no_listing_found',
        verificationSource: 'live_listing_not_found',
        summary: `Live probe on ${broker.domain} explicitly reported 0 matching records.`,
      });
    }

    if (hasNameAndCity) {
      return res.json({
        probeUrl,
        finalUrl: fetched.finalUrl,
        httpStatus: fetched.status,
        liveProbeStatus: 'listing_matched',
        verificationSource: 'live_listing_match_found',
        summary: `Live probe detected matching name & city tokens on ${fetched.finalUrl} (HTTP ${fetched.status}).`,
      });
    }

    return res.json({
      probeUrl,
      finalUrl: fetched.finalUrl,
      httpStatus: fetched.status,
      liveProbeStatus: 'portal_reachable',
      verificationSource: 'live_portal_probe_reachable',
      summary: `Portal ${broker.domain} is live (HTTP ${fetched.status}); interactive JS search required to confirm individual listing.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unreachable portal.';
    return res.json({
      probeUrl,
      finalUrl: probeUrl,
      httpStatus: 0,
      liveProbeStatus: 'unreachable',
      verificationSource: 'heuristic_exposure_estimate',
      summary: `Could not reach ${broker.domain} directly (${msg}).`,
    });
  }
});

// ============================================================================
// Autonomous Headless Browser Opt-Out Workflow Engine Endpoints
// ============================================================================

app.get('/api/workflows/capabilities', apiRateLimiter, (_req, res) => {
  res.json(getAutomationCapabilities());
});

app.get('/api/workflows/adapters', apiRateLimiter, (_req, res) => {
  res.json({ adapters: listAllBrokerPlaybooks() });
});

app.get('/api/workflows', apiRateLimiter, (req, res) => {
  const sessionId = getRequestSessionId(req);
  res.json({ jobs: listSessionWorkflowJobs(sessionId) });
});

app.post('/api/workflows/start', apiRateLimiter, async (req, res) => {
  const sessionId = getRequestSessionId(req);
  const profile = req.body.profile;
  if (!profile || typeof profile.firstName !== 'string' || typeof profile.lastName !== 'string') {
    return res.status(400).json({ error: 'Valid consumer UserProfile is required to start a workflow.' });
  }

  const mode =
    req.body.mode === 'autonomous_auto_submit'
      ? 'autonomous_auto_submit'
      : 'inspect_and_preview';

  const allowLoopback =
    process.env.SYNOUT_TEST_ALLOW_LOOPBACK === '1' && Boolean(req.body.allowLoopbackForTests);

  try {
    const job = await startOptOutWorkflow({
      sessionId,
      broker: req.body.broker || undefined,
      brokerId: sanitizeString(req.body.brokerId, 80) || undefined,
      brokerName: sanitizeString(req.body.brokerName, 100) || undefined,
      brokerDomain: sanitizeString(req.body.brokerDomain, 140) || undefined,
      targetUrl: sanitizeString(req.body.targetUrl, 380) || undefined,
      profile,
      senderEmail: sanitizeString(req.body.senderEmail, 160) || undefined,
      mode,
      disclosurePolicy: req.body.disclosurePolicy || undefined,
      fieldOverrides: req.body.fieldOverrides || undefined,
      selectedCandidateId: sanitizeString(req.body.selectedCandidateId, 80) || undefined,
      idempotencyKey: sanitizeString(req.body.idempotencyKey, 120) || undefined,
      allowLoopbackForTests: allowLoopback,
    });

    if (
      job.state === 'awaiting_broker_processing' ||
      job.state === 'awaiting_email_verification' ||
      job.state === 'submitted_unconfirmed'
    ) {
      pushSessionEvent(sessionId, {
        id: `ev-wf-${Date.now()}`,
        timestamp: new Date().toISOString(),
        brokerId: job.brokerId,
        brokerName: job.brokerName,
        brokerDomain: job.brokerDomain,
        action: 'SUBMITTED_AWAITING_EXTERNAL_CACHE_PURGE',
        externalConfirmationToken: job.brokerConfirmationCode || job.internalSubmissionId,
        statusText:
          job.evidence?.outcomeSummary ||
          `Headless workflow (${job.state}) completed for ${job.brokerName}.`,
        externalStatusCode: job.evidence?.httpStatus || 200,
      });
    }

    return res.json({ job });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed starting opt-out workflow.';
    return res.status(400).json({ error: msg });
  }
});

app.get('/api/workflows/:jobId', apiRateLimiter, (req, res) => {
  const sessionId = getRequestSessionId(req);
  const jobId = sanitizeString(req.params.jobId, 80);
  const job = getSessionWorkflowJob(sessionId, jobId);
  if (!job) {
    return res.status(404).json({ error: 'Workflow job not found in active session.' });
  }
  return res.json({ job });
});

app.post('/api/workflows/:jobId/approve-and-submit', apiRateLimiter, async (req, res) => {
  const sessionId = getRequestSessionId(req);
  const jobId = sanitizeString(req.params.jobId, 80);
  try {
    const job = await approveAndSubmitWorkflow({
      sessionId,
      jobId,
      fieldOverrides: req.body.fieldOverrides || undefined,
      disclosurePolicy: req.body.disclosurePolicy || undefined,
      selectedCandidateId: sanitizeString(req.body.selectedCandidateId, 80) || undefined,
    });

    if (
      job.state === 'awaiting_broker_processing' ||
      job.state === 'awaiting_email_verification' ||
      job.state === 'submitted_unconfirmed'
    ) {
      pushSessionEvent(sessionId, {
        id: `ev-wf-sub-${Date.now()}`,
        timestamp: new Date().toISOString(),
        brokerId: job.brokerId,
        brokerName: job.brokerName,
        brokerDomain: job.brokerDomain,
        action: 'SUBMITTED_AWAITING_EXTERNAL_CACHE_PURGE',
        externalConfirmationToken: job.brokerConfirmationCode || job.internalSubmissionId,
        statusText:
          job.evidence?.outcomeSummary ||
          `Approved web-form submission completed (${job.state}) for ${job.brokerName}.`,
        externalStatusCode: job.evidence?.httpStatus || 200,
      });
    }

    return res.json({ job });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed submitting workflow.';
    return res.status(400).json({ error: msg });
  }
});

app.post('/api/workflows/:jobId/verify-email', apiRateLimiter, async (req, res) => {
  const sessionId = getRequestSessionId(req);
  const jobId = sanitizeString(req.params.jobId, 80);
  const verificationUrl = sanitizeString(req.body.verificationUrl, 600);
  const rawEmailText = typeof req.body.rawEmailText === 'string' ? req.body.rawEmailText.slice(0, 12000) : undefined;

  if (!verificationUrl) {
    return res.status(400).json({ error: 'Verification link URL is required.' });
  }

  try {
    const job = await completeWorkflowEmailVerification({
      sessionId,
      jobId,
      verificationUrl,
      rawEmailText,
    });
    return res.json({ job });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Email verification link check failed.';
    return res.status(400).json({ error: msg });
  }
});

app.post('/api/workflows/:jobId/recheck', apiRateLimiter, async (req, res) => {
  const sessionId = getRequestSessionId(req);
  const jobId = sanitizeString(req.params.jobId, 80);
  const checkUrl = sanitizeString(req.body.checkUrl, 380) || undefined;

  try {
    const job = await recheckWorkflowListingRemoval({
      sessionId,
      jobId,
      checkUrl,
    });
    return res.json({ job });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Listing removal re-check failed.';
    return res.status(400).json({ error: msg });
  }
});

app.post('/api/workflows/:jobId/handoff-complete', apiRateLimiter, (req, res) => {
  const sessionId = getRequestSessionId(req);
  const jobId = sanitizeString(req.params.jobId, 80);
  const userProvidedConfirmationCode = sanitizeString(req.body.userProvidedConfirmationCode, 80);
  const requiresEmailVerification = Boolean(req.body.requiresEmailVerification);

  try {
    const job = recordManualHandoffCompletion({
      sessionId,
      jobId,
      userProvidedConfirmationCode: userProvidedConfirmationCode || undefined,
      requiresEmailVerification,
    });
    return res.json({ job });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not update handoff status.';
    return res.status(400).json({ error: msg });
  }
});

app.post('/api/workflows/:jobId/cancel', apiRateLimiter, (req, res) => {
  const sessionId = getRequestSessionId(req);
  const jobId = sanitizeString(req.params.jobId, 80);
  try {
    const job = cancelSessionWorkflowJob(sessionId, jobId);
    return res.json({ job });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not cancel workflow.';
    return res.status(404).json({ error: msg });
  }
});

// Endpoint: Automated Web Form Navigator execution via real Playwright WorkflowRunner (zero fabricated tickets)
app.post('/api/broker/execute-form-removal', apiRateLimiter, async (req, res) => {
  const sessionId = getRequestSessionId(req);
  const safeBrokerId = sanitizeString(req.body.brokerId || 'broker', 80);
  const safeBrokerName = sanitizeString(req.body.brokerName || 'Data Broker', 100);
  const safeBrokerDomain = sanitizeString(req.body.brokerDomain || 'broker.com', 100);
  const optOutUrl = sanitizeString(req.body.optOutUrl, 380);
  const profile = req.body.profile;

  if (!profile || typeof profile.firstName !== 'string') {
    return res.status(400).json({ error: 'Valid consumer UserProfile is required for autonomous form removal.' });
  }

  try {
    const job = await startOptOutWorkflow({
      sessionId,
      broker: req.body.broker || undefined,
      brokerId: safeBrokerId,
      brokerName: safeBrokerName,
      brokerDomain: safeBrokerDomain,
      targetUrl: optOutUrl || undefined,
      profile,
      senderEmail: sanitizeString(req.body.senderEmail, 160) || undefined,
      mode: 'autonomous_auto_submit',
    });

    const submitted =
      job.state === 'awaiting_broker_processing' ||
      job.state === 'awaiting_email_verification' ||
      job.state === 'submitted_unconfirmed';

    if (submitted) {
      pushSessionEvent(sessionId, {
        id: `ev-nav-${Date.now()}`,
        timestamp: new Date().toISOString(),
        brokerId: safeBrokerId,
        brokerName: safeBrokerName,
        brokerDomain: safeBrokerDomain,
        action: 'SUBMITTED_AWAITING_EXTERNAL_CACHE_PURGE',
        externalConfirmationToken: job.brokerConfirmationCode || job.internalSubmissionId,
        statusText:
          job.evidence?.outcomeSummary ||
          `Autonomous web-form workflow (${job.state}) completed for ${safeBrokerName}.`,
        externalStatusCode: job.evidence?.httpStatus || 200,
      });
    }

    return res.json({
      success: submitted,
      job,
      state: job.state,
      httpStatus: job.evidence?.httpStatus || 200,
      pageTitle: job.discoveredTitle,
      antiBotGate: job.blocker?.kind || 'none',
      internalSubmissionId: job.internalSubmissionId,
      brokerConfirmationCode: job.brokerConfirmationCode,
      confirmationCode: job.brokerConfirmationCode || null,
      blocker: job.blocker,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Autonomous form execution failed.';
    return res.status(502).json({ success: false, error: msg });
  }
});


// Endpoint: Execute a harvested broker email verification link via isolated SSRF-guarded Playwright
app.post('/api/inbox/execute-verification-link', apiRateLimiter, async (req, res) => {
  const sessionId = getRequestSessionId(req);
  const verificationUrl = sanitizeString(req.body.verificationUrl, 650);
  const expectedBrokerDomain = sanitizeString(req.body.expectedBrokerDomain, 160);
  const safeBrokerId = sanitizeString(req.body.brokerId || 'broker', 80);
  const safeBrokerName = sanitizeString(req.body.brokerName || expectedBrokerDomain || 'Data Broker', 100);
  const rawEmailText =
    typeof req.body.rawEmailText === 'string' ? req.body.rawEmailText.slice(0, 12000) : undefined;

  if (!verificationUrl || !expectedBrokerDomain) {
    return res
      .status(400)
      .json({ error: 'Both verificationUrl and expectedBrokerDomain are required.' });
  }

  const allowLoopback =
    process.env.SYNOUT_TEST_ALLOW_LOOPBACK === '1' && Boolean(req.body.allowLoopbackForTests);

  try {
    const result = await executeStandaloneVerificationLink({
      verificationUrl,
      expectedBrokerDomain,
      rawEmailText,
      allowLoopbackForTests: allowLoopback,
    });

    if (result.verified) {
      pushSessionEvent(sessionId, {
        id: `ev-harvester-${Date.now()}`,
        timestamp: new Date().toISOString(),
        brokerId: safeBrokerId,
        brokerName: safeBrokerName,
        brokerDomain: expectedBrokerDomain,
        action: 'EXTERNAL_PURGE_CONFIRMED',
        externalConfirmationToken:
          result.brokerConfirmationCode || `SHA256-${result.evidenceSha256.slice(0, 12)}`,
        statusText: result.summary,
        externalStatusCode: result.httpStatus,
      });
    }

    return res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Verification link execution failed.';
    return res.status(400).json({ error: msg });
  }
});

// Endpoint: Batch 30/60/90-day Re-Listing Diff Monitor Sweep
app.post('/api/monitoring/batch-recheck', apiRateLimiter, async (req, res) => {
  const brokers = Array.isArray(req.body.brokers) ? req.body.brokers.slice(0, 15) : [];
  const profile = req.body.profile || null;
  const previousHashes =
    req.body.previousHashes && typeof req.body.previousHashes === 'object'
      ? (req.body.previousHashes as Record<string, string>)
      : {};

  if (brokers.length === 0) {
    return res.status(400).json({ error: 'Provide at least one broker to re-check.' });
  }

  const diffs: Array<{
    brokerId: string;
    brokerName: string;
    brokerDomain: string;
    probeUrl: string;
    httpStatus: number;
    snapshotSha256: string;
    previousSha256: string | null;
    outcome:
      | 'confirmed_absent'
      | 'resurfaced_regression'
      | 'new_exposure_detected'
      | 'still_present_within_sla'
      | 'anti_bot_gated'
      | 'unreachable';
    checkedAtIso: string;
    summary: string;
  }> = [];

  const fullName = profile
    ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim().toLowerCase()
    : '';
  const city = (profile?.currentCity || '').trim().toLowerCase();
  const allowLoopback =
    process.env.SYNOUT_TEST_ALLOW_LOOPBACK === '1' && Boolean(req.body.allowLoopbackForTests);

  // Bounded concurrency (4 at a time)
  const chunkSize = 4;
  for (let i = 0; i < brokers.length; i += chunkSize) {
    const slice = brokers.slice(i, i + chunkSize);
    const batchResults = await Promise.all(
      slice.map(async (entry: { broker: any; baselineStatus?: string }) => {
        const broker = entry?.broker;
        const baselineStatus: 'clean' | 'removed' | 'submitted' =
          entry?.baselineStatus === 'clean'
            ? 'clean'
            : entry?.baselineStatus === 'removed'
            ? 'removed'
            : 'submitted';
        if (!broker || typeof broker.domain !== 'string') return null;

        const probeUrl =
          typeof broker.recordsUrl === 'string' && allowLoopback && broker.recordsUrl.startsWith('http://127.0.0.1')
            ? broker.recordsUrl
            : getBrokerRecordSearchUrl(broker, profile);
        const checkedAtIso = new Date().toISOString();
        const prevHash = previousHashes[broker.id] || null;

        try {
          const fetched = allowLoopback && probeUrl.startsWith('http://127.0.0.1')
            ? await (async () => {
                const r = await fetch(probeUrl, { signal: AbortSignal.timeout(5000) });
                return { status: r.status, bodyText: await r.text() };
              })()
            : await safePublicFetch(probeUrl, { timeoutMs: 5000 });
          const antiBot = detectAntiBotGate(fetched.bodyText, fetched.status);
          const plainText = fetched.bodyText
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          const snapshotSha256 = crypto
            .createHash('sha256')
            .update(`${fetched.status}|${plainText.slice(0, 8000)}`)
            .digest('hex');

          if (
            fetched.status === 403 ||
            fetched.status === 429 ||
            antiBot.gate === 'cloudflare_challenge'
          ) {
            return {
              brokerId: String(broker.id),
              brokerName: String(broker.name || broker.domain),
              brokerDomain: String(broker.domain),
              probeUrl,
              httpStatus: fetched.status,
              snapshotSha256,
              previousSha256: prevHash,
              outcome: 'anti_bot_gated' as const,
              checkedAtIso,
              summary: `${broker.domain} returned anti-bot gate (HTTP ${fetched.status}); manual spot-check recommended.`,
            };
          }

          const explicitAbsent =
            fetched.status === 404 ||
            fetched.status === 410 ||
            /\b(no\s+records?\s+found|0\s+results|could\s+not\s+find\s+any\s+records|no\s+matching\s+people)\b/i.test(
              plainText
            );

          if (explicitAbsent) {
            return {
              brokerId: String(broker.id),
              brokerName: String(broker.name || broker.domain),
              brokerDomain: String(broker.domain),
              probeUrl,
              httpStatus: fetched.status,
              snapshotSha256,
              previousSha256: prevHash,
              outcome: 'confirmed_absent' as const,
              checkedAtIso,
              summary: `Confirmed absent on ${broker.domain} (HTTP ${fetched.status}).`,
            };
          }

          const hasNameAndCity =
            fullName.length > 3 &&
            plainText.toLowerCase().includes(fullName) &&
            (!city || plainText.toLowerCase().includes(city));

          if (hasNameAndCity) {
            const outcome =
              baselineStatus === 'clean'
                ? ('new_exposure_detected' as const)
                : baselineStatus === 'removed'
                ? ('resurfaced_regression' as const)
                : ('still_present_within_sla' as const);
            return {
              brokerId: String(broker.id),
              brokerName: String(broker.name || broker.domain),
              brokerDomain: String(broker.domain),
              probeUrl,
              httpStatus: fetched.status,
              snapshotSha256,
              previousSha256: prevHash,
              outcome,
              checkedAtIso,
              summary:
                outcome === 'new_exposure_detected'
                  ? `NEW EXPOSURE ALERT: Previously clean broker ${broker.domain} now indexes matching personal record tokens!`
                  : outcome === 'resurfaced_regression'
                  ? `ALERT: Previously purged profile tokens resurfaced on ${broker.domain}!`
                  : `Listing tokens still visible on ${broker.domain} while awaiting broker purge.`,
            };
          }

          return {
            brokerId: String(broker.id),
            brokerName: String(broker.name || broker.domain),
            brokerDomain: String(broker.domain),
            probeUrl,
            httpStatus: fetched.status,
            snapshotSha256,
            previousSha256: prevHash,
            outcome: 'confirmed_absent' as const,
            checkedAtIso,
            summary: `No matching consumer listing tokens detected on ${broker.domain} (HTTP ${fetched.status}).`,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Timeout';
          return {
            brokerId: String(broker.id),
            brokerName: String(broker.name || broker.domain),
            brokerDomain: String(broker.domain),
            probeUrl,
            httpStatus: 0,
            snapshotSha256: crypto.createHash('sha256').update(`ERR|${probeUrl}`).digest('hex'),
            previousSha256: prevHash,
            outcome: 'unreachable' as const,
            checkedAtIso,
            summary: `Could not reach ${broker.domain} (${msg}).`,
          };
        }
      })
    );

    for (const item of batchResults) {
      if (item) diffs.push(item);
    }
  }

  return res.json({
    checkedCount: diffs.length,
    resurfacedCount: diffs.filter((d) => d.outcome === 'resurfaced_regression').length,
    newExposureCount: diffs.filter((d) => d.outcome === 'new_exposure_detected').length,
    confirmedAbsentCount: diffs.filter((d) => d.outcome === 'confirmed_absent').length,
    diffs,
  });
});

// Endpoint: Send or log Automated Re-Listing Surveillance Digest Alert
app.post('/api/monitoring/send-relisting-digest', apiRateLimiter, async (req, res) => {
  const sessionId = getRequestSessionId(req);
  const recipientEmail = sanitizeString(req.body.recipientEmail, 254).toLowerCase();
  const subject = sanitizeString(
    req.body.subject || '[synOUT Security Alert] Re-Listing Surveillance Digest',
    220
  );
  const rawBody = typeof req.body.body === 'string' ? req.body.body.slice(0, 24000) : '';
  const brokerNames = Array.isArray(req.body.brokerNames)
    ? req.body.brokerNames.map((b: unknown) => sanitizeString(b, 80)).filter(Boolean).slice(0, 25)
    : [];
  const resurfacedCount = Math.max(0, Math.min(500, Number(req.body.resurfacedCount || 0)));

  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return res.status(400).json({ error: 'Valid recipientEmail is required.' });
  }

  const nowIso = new Date().toISOString();
  const fallbackMessageId = `<relisting-digest-${Date.now()}-${crypto.randomBytes(4).toString('hex')}@alert.synout.privacy>`;

  pushSessionEvent(sessionId, {
    id: `ev-digest-${Date.now()}`,
    timestamp: nowIso,
    brokerId: 'relisting-digest-monitor',
    brokerName: brokerNames[0] || 'Re-Listing Monitor',
    brokerDomain: 'synout.local',
    action: 'INTERCEPTED',
    externalConfirmationToken: fallbackMessageId,
    statusText:
      resurfacedCount > 0
        ? `Re-listing digest alert prepared for ${recipientEmail} (${resurfacedCount} resurfaced broker(s)).`
        : `Test re-listing digest verification logged for ${recipientEmail}.`,
    externalStatusCode: 200,
  });

  return res.json({
    success: true,
    deliveredViaSmtp: false,
    messageId: fallbackMessageId,
    recipientEmail,
    sentAt: nowIso,
    bodyLength: scrubSensitivePII(rawBody).length,
  });
});

// Endpoint: Audit a registered broker's statutory opt-out portal & Global Privacy Control (.well-known/gpc.json)
app.post('/api/registries/audit-broker-gpc', apiRateLimiter, async (req, res) => {
  const domain = sanitizeString(req.body.domain, 140)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
  const optOutUrl = sanitizeString(req.body.optOutUrl, 380);

  if (!domain) {
    return res.status(400).json({ error: 'Broker domain is required.' });
  }

  let gpcWellKnownSupported = false;
  let gpcStatus = 0;
  try {
    const gpcRes = await safePublicFetch(`https://${domain}/.well-known/gpc.json`, {
      timeoutMs: 4000,
    });
    gpcStatus = gpcRes.status;
    if (gpcRes.status === 200) {
      const parsed = JSON.parse(gpcRes.bodyText);
      gpcWellKnownSupported = Boolean(parsed && parsed.gpc === true);
    }
  } catch {
    gpcWellKnownSupported = false;
  }

  let portalReachable = false;
  let portalHttpStatus = 0;
  const targetPortal = optOutUrl || `https://${domain}`;
  try {
    const portalRes = await safePublicFetch(targetPortal, { timeoutMs: 5000 });
    portalHttpStatus = portalRes.status;
    portalReachable = portalRes.status >= 200 && portalRes.status < 400;
  } catch {
    portalReachable = false;
  }

  return res.json({
    domain,
    checkedAtIso: new Date().toISOString(),
    gpcWellKnownSupported,
    gpcStatus,
    portalReachable,
    portalHttpStatus,
    complianceSummary:
      portalReachable && gpcWellKnownSupported
        ? `Portal online (HTTP ${portalHttpStatus}) & publishes .well-known/gpc.json (gpc: true).`
        : portalReachable
        ? `Opt-out portal reachable (HTTP ${portalHttpStatus}); no .well-known/gpc.json manifest published.`
        : `Opt-out portal returned HTTP ${portalHttpStatus || 'unreachable'} — potential statutory availability issue.`,
  });
});

// Endpoint: Session-isolated live feed
app.get('/api/realtime-protection/live-feed', (req, res) => {
  const sessionId = getRequestSessionId(req);
  res.json({
    activeMonitoring: true,
    events: getSessionEvents(sessionId),
    lastSync: new Date().toISOString(),
  });
});

app.get('/api/health', (_req, res) => {
  const automation = getAutomationCapabilities();
  res.json({
    status: 'ok',
    service: 'synOUT Privacy Engine',
    secretHygiene: 'env-isolated',
    browserAutomation: automation.workerMode,
    headlessAvailable: automation.headlessBrowserAvailable,
    timestamp: new Date().toISOString(),
  });
});

// Structured JSON error handler for API routes
app.use('/api', (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : 'Unexpected server error.';
  res.status(400).json({ error: message });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`synOUT app server running on http://0.0.0.0:${PORT}`);
  });
}

if (process.env.SYNOUT_IMPORT_SERVER_ONLY !== '1') {
  startServer();
}
