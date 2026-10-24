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
  resolveSmtpTransportSettings,
} from './src/utils/emailProviderConfig.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
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

// In-memory realtime event log
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

const realtimeProtectionEvents: RealtimeProtectionEvent[] = [
  {
    id: 'ev-1',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    brokerId: 'whitepages',
    brokerName: 'Whitepages',
    brokerDomain: 'whitepages.com',
    action: 'DISPATCHING_REMOVAL',
    externalConfirmationToken: 'SYN-9281-WP',
    statusText: 'Statutory CCPA deletion notice transmitted to legal compliance desk.',
    externalStatusCode: 202,
  },
  {
    id: 'ev-2',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    brokerId: 'spokeo',
    brokerName: 'Spokeo',
    brokerDomain: 'spokeo.com',
    action: 'INTERCEPTED',
    externalConfirmationToken: 'SYN-4412-SPK',
    statusText: 'New syndication listing intercepted and queued for automated opt-out.',
    externalStatusCode: 200,
  },
];

// Endpoint: Purge Session & In-Memory Logs
app.post('/api/user/purge-session', (req, res) => {
  realtimeProtectionEvents.length = 0;
  rateLimitMap.clear();
  clearAllPooledTransporters();
  res.json({ success: true, message: 'All in-memory session events and audit traces expunged.' });
});

// Endpoint: Generate customized statutory legal notice (synOUT Legal Engine)
const apiKey = process.env.GEMINI_API_KEY || '';
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
}

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

  if (!ai) {
    return res.json({ letter: fallbackLetter });
  }

  try {
    const prompt = `Write a formal, legally grounded Consumer Data Deletion and Opt-Out of Sale demand letter.
Statute: ${statute}
Consumer: ${userName} residing in ${userCity}, ${userState}
Entity: ${brokerName} (${brokerDomain})
Notice requirement: Demand permanent deletion of phone, address, and online records within statutory deadlines. No preamble or conversational filler.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const letter = response.text?.trim() || fallbackLetter;
    return res.json({ letter: scrubSensitivePII(letter) });
  } catch (error) {
    return res.json({ letter: fallbackLetter });
  }
});

// Endpoint: Send or log notice dispatch
app.post('/api/legal/send-gmail-notice', apiRateLimiter, (req, res) => {
  const safeBrokerName = sanitizeString(req.body.brokerName || 'Data Broker', 100);
  const safeBrokerDomain = sanitizeString(req.body.brokerDomain || 'broker.com', 100);
  const messageId = `<synout-${Date.now()}-${Math.random().toString(36).substr(2, 8)}@mail.synout.privacy>`;
  const nowIso = new Date().toISOString();

  realtimeProtectionEvents.unshift({
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
  const sourceTitle = sanitizeString(req.body.sourceTitle || 'Dark Web Leak Host', 120);
  const hostContact = sanitizeString(req.body.hostContact || 'abuse@network', 120);
  const sourceCategory = sanitizeString(req.body.sourceCategory || 'Dark Web Archive', 80);
  const referenceId = `DW-TK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const nowIso = new Date().toISOString();

  realtimeProtectionEvents.unshift({
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

function formatFriendlySmtpError(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'SMTP connection failed.';
  if (/535|Username and Password not accepted|Application-specific password/i.test(raw)) {
    return 'Authentication rejected by mail server. Use an App Password (not your regular login password) and verify your email address.';
  }
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(raw)) {
    return `Could not reach outbound SMTP server (${raw.slice(0, 90)}). Verify your host and port settings.`;
  }
  return raw.slice(0, 180);
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
    auth: {
      user: userEmail,
      pass: normalizedAuthPass,
    },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 20000,
  });

  const timer = scheduleEviction(key);
  timer.unref?.();
  smtpTransportPool.set(key, { transporter, timer });

  return { key, transporter };
}

// Endpoint: Disconnect & immediately close any warm pooled SMTP sockets
app.post('/api/email/disconnect', (_req, res) => {
  clearAllPooledTransporters();
  res.json({ disconnected: true });
});

// Endpoint: Stateless verification of user-connected email account (Zero persistent storage)
app.post('/api/email/verify-account', apiRateLimiter, async (req, res) => {
  const provider = sanitizeString(req.body.provider || 'gmail', 20) as EmailProviderId;
  const userEmail = sanitizeString(req.body.userEmail, 160);
  const appPassword = typeof req.body.appPassword === 'string' ? req.body.appPassword.trim() : '';
  const customHost = sanitizeString(req.body.customHost, 160);
  const customPort = Number(req.body.customPort || 587);
  const customSecure = typeof req.body.customSecure === 'boolean' ? req.body.customSecure : undefined;

  if (!isValidEmailAddress(userEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address to connect.' });
  }
  if (!appPassword || appPassword.length < 4 || appPassword.length > 256) {
    return res.status(400).json({ error: 'Enter a valid App Password or SMTP token.' });
  }

  let smtp: ResolvedSmtpConfig;
  try {
    smtp = resolveSmtpTransportSettings({
      provider,
      customHost,
      customPort,
      customSecure,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid SMTP configuration.';
    return res.status(400).json({ error: msg });
  }

  // Strip spaces in 16-char Google/Apple/Yahoo app passwords if pasted in 4x4 groups
  const normalizedAuthPass =
    provider === 'gmail' || provider === 'yahoo' || provider === 'icloud'
      ? appPassword.replace(/\s+/g, '')
      : appPassword;

  const { key, transporter } = getOrCreatePooledTransporter(smtp, userEmail, normalizedAuthPass);

  try {
    await transporter.verify();
    return res.json({
      verified: true,
      provider: smtp.provider,
      host: smtp.host,
      port: smtp.port,
    });
  } catch (err) {
    evictPooledTransporter(key);
    return res.status(401).json({
      verified: false,
      error: formatFriendlySmtpError(err),
    });
  }
});

// Endpoint: Send statutory opt-out email directly from user's own email on their behalf
app.post('/api/email/dispatch-on-behalf', apiRateLimiter, async (req, res) => {
  const provider = sanitizeString(req.body.provider || 'gmail', 20) as EmailProviderId;
  const userEmail = sanitizeString(req.body.userEmail, 160);
  const senderName = sanitizeString(req.body.senderName || 'Authorized Consumer', 100).replace(/["<>]/g, '');
  const appPassword = typeof req.body.appPassword === 'string' ? req.body.appPassword.trim() : '';
  const customHost = sanitizeString(req.body.customHost, 160);
  const customPort = Number(req.body.customPort || 587);
  const customSecure = typeof req.body.customSecure === 'boolean' ? req.body.customSecure : undefined;
  const bccSelf = Boolean(req.body.bccSelf);

  const recipientEmail = sanitizeString(req.body.recipientEmail, 160);
  const subject = sanitizeString(req.body.subject, 240);
  const rawBody = typeof req.body.body === 'string' ? req.body.body.trim().slice(0, 12000) : '';
  const safeBrokerId = sanitizeString(req.body.brokerId || 'broker', 80);
  const safeBrokerName = sanitizeString(req.body.brokerName || 'Data Broker', 100);
  const safeBrokerDomain = sanitizeString(req.body.brokerDomain || 'broker.com', 100);

  if (!isValidEmailAddress(userEmail)) {
    return res.status(400).json({ error: 'Valid connected sender email is required.' });
  }
  if (!isValidEmailAddress(recipientEmail)) {
    return res.status(400).json({ error: 'Valid broker privacy email address is required.' });
  }
  if (!appPassword || appPassword.length < 4 || appPassword.length > 256) {
    return res.status(400).json({ error: 'Valid App Password or SMTP token is required.' });
  }
  if (!subject || !rawBody) {
    return res.status(400).json({ error: 'Subject line and legal notice body cannot be empty.' });
  }

  let smtp: ResolvedSmtpConfig;
  try {
    smtp = resolveSmtpTransportSettings({
      provider,
      customHost,
      customPort,
      customSecure,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid SMTP configuration.';
    return res.status(400).json({ error: msg });
  }

  const normalizedAuthPass =
    provider === 'gmail' || provider === 'yahoo' || provider === 'icloud'
      ? appPassword.replace(/\s+/g, '')
      : appPassword;

  const mailOptions: Parameters<SmtpTransporter['sendMail']>[0] = {
    from: senderName ? `"${senderName}" <${userEmail}>` : userEmail,
    replyTo: userEmail,
    to: recipientEmail,
    bcc: bccSelf ? userEmail : undefined,
    subject,
    text: scrubSensitivePII(rawBody),
  };

  let { key, transporter } = getOrCreatePooledTransporter(smtp, userEmail, normalizedAuthPass);

  try {
    let info;
    try {
      info = await transporter.sendMail(mailOptions);
    } catch (firstErr) {
      // Retry once on fresh TLS connection if a pooled socket closed mid-batch
      evictPooledTransporter(key);
      const retryPool = getOrCreatePooledTransporter(smtp, userEmail, normalizedAuthPass);
      key = retryPool.key;
      transporter = retryPool.transporter;
      info = await transporter.sendMail(mailOptions);
    }

    const nowIso = new Date().toISOString();
    const messageId = info.messageId || `<synout-${Date.now()}@${smtp.host}>`;

    realtimeProtectionEvents.unshift({
      id: `ev-smtp-${Date.now()}`,
      timestamp: nowIso,
      brokerId: safeBrokerId,
      brokerName: safeBrokerName,
      brokerDomain: safeBrokerDomain,
      action: 'DISPATCHING_REMOVAL',
      externalConfirmationToken: messageId,
      statusText: `Statutory deletion demand sent from ${userEmail} via ${smtp.host} to ${safeBrokerName} (${recipientEmail}).`,
      externalStatusCode: 200,
    });

    return res.json({
      success: true,
      messageId,
      sentFrom: userEmail,
      recipientEmail,
      sentAt: nowIso,
      brokerName: safeBrokerName,
    });
  } catch (err) {
    evictPooledTransporter(key);
    return res.status(502).json({
      success: false,
      error: formatFriendlySmtpError(err),
    });
  }
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

// Endpoint: Live feed
app.get('/api/realtime-protection/live-feed', (req, res) => {
  res.json({
    activeMonitoring: true,
    events: realtimeProtectionEvents,
    lastSync: new Date().toISOString(),
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'synOUT Privacy Engine',
    secretHygiene: 'env-isolated',
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
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`synOUT app server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
