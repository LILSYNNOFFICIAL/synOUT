import crypto from 'node:crypto';
import type express from 'express';
import type { EmailProviderId } from '../utils/emailProviderConfig.ts';

export const SESSION_COOKIE_NAME = 'synout_sid';
export const SESSION_HEADER_NAME = 'x-synout-session';

const SESSION_ID_REGEX = /^[a-f0-9]{48,96}$/i;
const CREDENTIAL_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours max in-memory session lifetime
const MAX_STORED_CREDENTIALS = 500;

/**
 * Ephemeral 256-bit AES-GCM key generated strictly in RAM per server boot.
 * Zero disk persistence; wiped automatically on process exit or session purge.
 */
const EPHEMERAL_VAULT_KEY = crypto.randomBytes(32);

export interface StoredSmtpSecretPayload {
  provider: EmailProviderId;
  userEmail: string;
  normalizedAuthPass: string;
  customHost?: string;
  customPort?: number;
  customSecure?: boolean;
  resolvedHost: string;
  resolvedPort: number;
  resolvedSecure: boolean;
}

interface EncryptedCredentialRecord {
  credentialId: string;
  sessionId: string;
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
  createdAtMs: number;
  expiresAtMs: number;
}

const credentialVault = new Map<string, EncryptedCredentialRecord>();

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

export function isValidSessionToken(token: string | undefined | null): token is string {
  return typeof token === 'string' && SESSION_ID_REGEX.test(token.trim());
}

export function mintSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

declare global {
  namespace Express {
    interface Request {
      synoutSessionId?: string;
    }
  }
}

/**
 * Assigns and isolates each browser client into a cryptographic session ID via both
 * an HttpOnly SameSite=Strict cookie AND X-Synout-Session response/request header
 * (ensuring seamless isolation inside sandboxed preview iframes as well as standalone tabs).
 */
export function sessionIsolationMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const headerTokenRaw = req.headers[SESSION_HEADER_NAME];
  const headerToken = Array.isArray(headerTokenRaw) ? headerTokenRaw[0] : headerTokenRaw;
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[SESSION_COOKIE_NAME];

  let sessionId: string;
  if (isValidSessionToken(headerToken)) {
    sessionId = headerToken.trim().toLowerCase();
  } else if (isValidSessionToken(cookieToken)) {
    sessionId = cookieToken.trim().toLowerCase();
  } else {
    sessionId = mintSessionToken();
  }

  req.synoutSessionId = sessionId;
  res.setHeader('X-Synout-Session', sessionId);
  res.setHeader('Access-Control-Expose-Headers', 'X-Synout-Session');

  if (cookieToken !== sessionId) {
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const cookieParts = [
      `${SESSION_COOKIE_NAME}=${sessionId}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      'Max-Age=14400',
    ];
    if (isSecure) {
      cookieParts.push('Secure');
    }
    res.setHeader('Set-Cookie', cookieParts.join('; '));
  }

  next();
}

export function getRequestSessionId(req: express.Request): string {
  if (req.synoutSessionId) return req.synoutSessionId;
  const fallback = mintSessionToken();
  req.synoutSessionId = fallback;
  return fallback;
}

function pruneExpiredCredentials(): void {
  const now = Date.now();
  for (const [id, rec] of credentialVault.entries()) {
    if (now >= rec.expiresAtMs) {
      credentialVault.delete(id);
    }
  }
  if (credentialVault.size > MAX_STORED_CREDENTIALS) {
    const oldestKey = credentialVault.keys().next().value;
    if (oldestKey) credentialVault.delete(oldestKey);
  }
}

/**
 * Encrypts verified SMTP credentials in server RAM using AES-256-GCM bound to the caller's sessionId.
 * Returns an opaque credentialId so the browser NEVER stores plaintext or Base64 passwords.
 */
export function storeSessionSmtpCredential(
  sessionId: string,
  payload: StoredSmtpSecretPayload
): { credentialId: string; expiresAtIso: string } {
  pruneExpiredCredentials();

  // Remove any prior SMTP credential for this session to avoid stale accumulation
  for (const [id, rec] of credentialVault.entries()) {
    if (rec.sessionId === sessionId) {
      credentialVault.delete(id);
    }
  }

  const credentialId = `cred_${crypto.randomBytes(24).toString('hex')}`;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', EPHEMERAL_VAULT_KEY, iv);
  cipher.setAAD(Buffer.from(`${sessionId}:${credentialId}`, 'utf8'));

  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const now = Date.now();
  const expiresAtMs = now + CREDENTIAL_TTL_MS;

  credentialVault.set(credentialId, {
    credentialId,
    sessionId,
    iv,
    authTag,
    ciphertext,
    createdAtMs: now,
    expiresAtMs,
  });

  return {
    credentialId,
    expiresAtIso: new Date(expiresAtMs).toISOString(),
  };
}

/**
 * Decrypts an opaque credentialId ONLY if it belongs to the requesting sessionId and has not expired.
 */
export function resolveSessionSmtpCredential(
  sessionId: string,
  credentialId: string
): StoredSmtpSecretPayload | null {
  pruneExpiredCredentials();
  const rec = credentialVault.get(credentialId);
  if (!rec) return null;
  if (rec.sessionId !== sessionId) {
    return null;
  }

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', EPHEMERAL_VAULT_KEY, rec.iv);
    decipher.setAAD(Buffer.from(`${sessionId}:${credentialId}`, 'utf8'));
    decipher.setAuthTag(rec.authTag);
    const decrypted = Buffer.concat([decipher.update(rec.ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8')) as StoredSmtpSecretPayload;
  } catch {
    credentialVault.delete(credentialId);
    return null;
  }
}

export function clearSessionSmtpCredentials(sessionId?: string): void {
  if (!sessionId) {
    credentialVault.clear();
    return;
  }
  for (const [id, rec] of credentialVault.entries()) {
    if (rec.sessionId === sessionId) {
      credentialVault.delete(id);
    }
  }
}
